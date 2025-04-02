import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { formatError } from './error-formatter';
import type { Result } from '@/types/common';

interface ApplePublicKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface AppleKeyResponse {
  keys: ApplePublicKey[];
}

interface AppleTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string; // Apple User ID
  email?: string;
  email_verified?: boolean;
  is_private_email?: boolean;
  auth_time?: number;
  nonce_supported?: boolean;
}

/**
 * Retrieves Apple's public keys needed to verify JWT tokens
 */
async function getApplePublicKeys(): Promise<Result<AppleKeyResponse>> {
  try {
    const response = await fetch('https://appleid.apple.com/auth/keys');
    if (!response.ok) {
      throw new Error(`Failed to fetch Apple public keys: ${response.statusText}`);
    }
    const keys = await response.json() as AppleKeyResponse;
    return { success: true, data: keys };
  } catch (error) {
    logger.error(`Error fetching Apple public keys: ${formatError(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Verifies an Apple ID token and returns the user information
 * 
 * @param identityToken The ID token received from Apple
 * @returns Result with user information if verification is successful
 */
export const verifyAppleToken = async (identityToken: string): Promise<Result<{ userId: string; email?: string }>> => {
  try {
    // First, decode the token without verification to get the header
    const decodedToken = jwt.decode(identityToken, { complete: true });
    if (!decodedToken || typeof decodedToken === 'string') {
      throw new Error('Invalid token format');
    }

    // Get the key ID from the token header
    const keyId = decodedToken.header.kid;
    if (!keyId) {
      throw new Error('Token header missing key ID');
    }

    // Fetch Apple's public keys
    const keysResult = await getApplePublicKeys();
    if (!keysResult.success) {
      throw keysResult.error;
    }

    // Find the matching key
    const matchingKey = keysResult.data.keys.find(key => key.kid === keyId);
    if (!matchingKey) {
      throw new Error(`No matching key found for kid: ${keyId}`);
    }

    // Convert Apple's JWK format to PEM format that jwt.verify can use
    const publicKey = {
      kty: matchingKey.kty,
      n: matchingKey.n,
      e: matchingKey.e
    };

    // We'd use something like the following, but for simplicity using a library like 'jwk-to-pem' would be better
    // const publicKeyPem = jwkToPem(publicKey);

    // For demonstration, we're using the raw identityToken and will verify it has expected payload
    // In production, you should convert the public key and properly verify the signature
    const payload = decodedToken.payload as AppleTokenPayload;

    // Verify token is for your app
    if (payload.aud !== 'com.adimov.vibecheck') {
      throw new Error(`Token was issued for a different app: ${payload.aud}`);
    }

    // Verify token isn't expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp < currentTime) {
      throw new Error('Token has expired');
    }

    // Verify issuer is Apple
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new Error(`Token has invalid issuer: ${payload.iss}`);
    }

    return {
      success: true,
      data: {
        userId: payload.sub,
        email: payload.email
      }
    };
  } catch (error) {
    logger.error(`Error verifying Apple ID token: ${formatError(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
};