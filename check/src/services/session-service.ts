// src/services/session-service.ts
import { config } from '@/config';
import { AuthenticationError } from '@/middleware/error';
import type { Result } from '@/types/common';
import { formatError } from '@/utils/error-formatter';
import { log } from '@/utils/logger';
// Import jose functions and types
import { SignJWT, jwtVerify, type JWTPayload, decodeProtectedHeader } from 'jose';
import { jwtKeyService, type JWTKey } from './jwt-key-service';
import { redisClient } from '@/config';

// Define payload interface extending JWTPayload
interface SessionPayload extends JWTPayload {
  userId: string;
  // Optional standard claims (jose handles exp, iat, etc.)
  iss?: string; // Issuer
  aud?: string; // Audience
}

// In-memory cache for verification keys
interface CachedKey {
  key: JWTKey;
  encodedSecret: Uint8Array;
  cachedAt: number;
}

const keyCache = new Map<string, CachedKey>();
const KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Subscribe to key update events
let pubsubClient: typeof redisClient | null = null;

const initializePubSub = async () => {
  try {
    // Create a duplicate client for pub/sub
    pubsubClient = redisClient.duplicate();
    await pubsubClient.connect();
    
    await pubsubClient.subscribe('jwt:key:updates', (message) => {
      try {
        const event = JSON.parse(message);
        log.info('JWT key update event received', { event: event.event });
        
        // Clear cache on key updates
        if (event.event === 'key_rotated' || event.event === 'key_revoked') {
          keyCache.clear();
          log.debug('Cleared JWT key cache due to key update');
        }
      } catch (error) {
        log.error('Failed to process JWT key update event', { error: formatError(error) });
      }
    });
    
    log.info('Subscribed to JWT key update events');
  } catch (error) {
    log.error('Failed to initialize JWT key pub/sub', { error: formatError(error) });
  }
};

// Initialize pub/sub on module load
initializePubSub();

// Prepare the secret key for jose (needs to be Uint8Array)
let secretKey: Uint8Array | null = null;
const getSecretKey = (): Uint8Array => {
  if (!secretKey) {
    if (!config.jwt.secret) {
      log.error('JWT secret is not configured. Cannot initialize secret key.');
      throw new Error('JWT_SECRET environment variable is not set or empty.');
    }
    secretKey = new TextEncoder().encode(config.jwt.secret);
  }
  return secretKey;
};

/**
 * Gets a JWT key from cache or fetches it
 */
const getCachedKey = async (keyId: string): Promise<CachedKey | null> => {
  // Check cache first
  const cached = keyCache.get(keyId);
  if (cached && (Date.now() - cached.cachedAt) < KEY_CACHE_TTL) {
    return cached;
  }

  // Fetch from service
  const keyResult = await jwtKeyService.getKeyById(keyId);
  if (!keyResult.success || !keyResult.data) {
    return null;
  }

  const key = keyResult.data;
  const encodedSecret = new TextEncoder().encode(key.secret);
  
  const cachedKey: CachedKey = {
    key,
    encodedSecret,
    cachedAt: Date.now()
  };

  keyCache.set(keyId, cachedKey);
  return cachedKey;
};

/**
 * Creates a session token (JWT) for a given user ID using jose.
 *
 * @param userId The ID of the user for whom to create the session.
 * @returns A Promise resolving to a Result containing the session token or an error.
 */
export const createSessionToken = async (userId: string): Promise<Result<string>> => {
  try {
    // Get the current signing key
    const signingKeyIdResult = await jwtKeyService.getCurrentSigningKeyId();
    if (!signingKeyIdResult.success || !signingKeyIdResult.data) {
      // Fallback to legacy key
      log.warn('No active signing key found, using legacy key');
      const key = getSecretKey();
      const payload: SessionPayload = { userId };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(config.jwt.expiresIn)
        .sign(key);

      return { success: true, data: token };
    }

    const signingKeyId = signingKeyIdResult.data;
    const cachedKey = await getCachedKey(signingKeyId);
    
    if (!cachedKey) {
      log.error('Failed to get signing key', { keyId: signingKeyId });
      return { success: false, error: new Error('Failed to get signing key') };
    }

    if (cachedKey.key.status === 'expired') {
      log.error('Signing key is expired', { keyId: signingKeyId });
      return { success: false, error: new Error('Signing key is expired') };
    }

    const payload: SessionPayload = { userId };

    // Create the JWT with key ID in header
    const token = await new SignJWT(payload)
      .setProtectedHeader({ 
        alg: cachedKey.key.algorithm,
        kid: cachedKey.key.id
      })
      .setIssuedAt()
      .setExpirationTime(config.jwt.expiresIn)
      .sign(cachedKey.encodedSecret);

    log.debug('Session token created successfully using key rotation', { userId, keyId: signingKeyId });
    return { success: true, data: token };
  } catch (error) {
    log.error('Error creating session token', { userId, error: formatError(error) });
    return { success: false, error: new Error('Failed to create session token') };
  }
};

/**
 * Verifies a session token (JWT) using jose and returns the decoded payload.
 *
 * @param token The session token to verify.
 * @returns A Promise resolving to a Result containing the decoded SessionPayload or an AuthenticationError.
 */
export const verifySessionToken = async (token: string): Promise<Result<SessionPayload, AuthenticationError>> => {
  try {
    // First, decode the header to get the key ID
    const header = decodeProtectedHeader(token);
    const keyId = header.kid as string | undefined;

    if (keyId) {
      // Token has a key ID - use key-based verification
      const cachedKey = await getCachedKey(keyId);
      
      if (!cachedKey) {
        log.warn('JWT key not found', { keyId });
        return { success: false, error: new AuthenticationError('Invalid token - key not found') };
      }

      if (cachedKey.key.status === 'expired') {
        log.warn('JWT key is expired', { keyId });
        return { success: false, error: new AuthenticationError('Invalid token - key expired') };
      }

      // Verify with the specific key
      const { payload } = await jwtVerify(token, cachedKey.encodedSecret, {
        algorithms: [cachedKey.key.algorithm],
      });

      // Type check the payload
      if (!payload || typeof payload.userId !== 'string') {
        throw new AuthenticationError('Invalid token payload: Missing or invalid userId');
      }

      log.debug('Session token verified successfully with key rotation', { 
        userId: payload.userId,
        keyId 
      });
      return { success: true, data: payload as SessionPayload };
    } else {
      // No key ID - try legacy verification
      log.debug('No key ID in token, using legacy verification');
      
      const key = getSecretKey();
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
      });

      // Type check the payload
      if (!payload || typeof payload.userId !== 'string') {
        throw new AuthenticationError('Invalid token payload: Missing or invalid userId');
      }

      log.debug('Session token verified successfully using legacy key', { userId: payload.userId });
      return { success: true, data: payload as SessionPayload };
    }
  } catch (error) {
    const errorMessage = formatError(error);
    log.warn('Session token verification failed', { error: errorMessage, errorName: error instanceof Error ? error.name : 'unknown' });

    // Handle specific jose errors
    if (error instanceof Error) {
      if (error.name === 'JWTExpired') {
        return { success: false, error: new AuthenticationError('Token expired') };
      }
      if (error.name === 'JWSSignatureVerificationFailed' || error.name === 'JWSInvalid' || error.message?.includes('signature verification failed')) {
        return { success: false, error: new AuthenticationError('Invalid token signature') };
      }
      if (error.name === 'JWTClaimValidationFailed') {
        return { success: false, error: new AuthenticationError(`Token claim validation failed: ${error.message}`) };
      }
      if (error.message.includes('JWT_SECRET')) {
        // Catch the error from getSecretKey()
        return { success: false, error: new AuthenticationError('Server configuration error during token verification') };
      }
      // Jose v6 error handling
      if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' || error.code === 'ERR_JWS_INVALID') {
        return { success: false, error: new AuthenticationError('Invalid token signature') };
      }
    }

    // Generic fallback
    return { success: false, error: new AuthenticationError('Token verification failed') };
  }
};

// Optional: Add functions for session revocation if needed
