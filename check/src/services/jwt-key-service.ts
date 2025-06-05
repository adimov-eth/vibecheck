import { randomBytes, randomUUID } from 'node:crypto';
import { createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { redisClient } from '@/config';
import type { Result } from '@/types/common';
import { formatError } from '@/utils/error-formatter';
import { log } from '@/utils/logger';

// JWT Key interface
export interface JWTKey {
  id: string;
  secret: string;
  algorithm: 'HS256' | 'RS256';
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'rotating' | 'expired';
}

// Configuration for JWT key management
export const jwtKeyConfig = {
  rotation: {
    interval: 30 * 24 * 60 * 60 * 1000, // 30 days
    gracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxActiveKeys: 3,
    checkInterval: 60 * 60 * 1000 // Check hourly
  },
  encryption: {
    algorithm: 'aes-256-gcm' as const,
    keyDerivation: 'pbkdf2' as const,
    iterations: 100000,
    saltLength: 32,
    ivLength: 16,
    tagLength: 16
  },
  storage: {
    keyPrefix: 'jwt:keys:',
    ttl: 45 * 24 * 60 * 60 // 45 days
  }
};

// Redis key constants
const REDIS_KEYS = {
  ACTIVE_SIGNING_KEY: 'jwt:keys:active_signing_key_id',
  ALL_KEYS: 'jwt:keys:all',
  KEY_PREFIX: 'jwt:keys:',
  ROTATION_LOCK: 'jwt:keys:rotation:lock',
  REVOKED_KEYS: 'jwt:keys:revoked',
  PUBSUB_CHANNEL: 'jwt:key:updates'
} as const;

// Encryption helper functions
class EncryptionService {
  private readonly encryptionKey: Buffer;

  constructor() {
    // Derive encryption key from JWT_ENCRYPTION_KEY or JWT_SECRET
    const secret = process.env.JWT_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
    if (!secret) {
      throw new Error('JWT_ENCRYPTION_KEY or JWT_SECRET must be set');
    }
    
    // Use a fixed salt for deterministic key derivation
    const salt = Buffer.from('jwt-key-encryption-salt-v1');
    this.encryptionKey = scryptSync(secret, salt, 32);
  }

  encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(jwtKeyConfig.encryption.ivLength);
    const cipher = createCipheriv(
      jwtKeyConfig.encryption.algorithm,
      this.encryptionKey,
      iv
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
      jwtKeyConfig.encryption.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

class JWTKeyService {
  private readonly encryption: EncryptionService;

  constructor() {
    this.encryption = new EncryptionService();
  }

  /**
   * Generates a new cryptographic key
   */
  async generateNewKey(): Promise<Result<JWTKey>> {
    try {
      const key: JWTKey = {
        id: `jwt-key-${randomUUID()}`,
        secret: randomBytes(64).toString('base64'),
        algorithm: 'HS256',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + jwtKeyConfig.rotation.interval + jwtKeyConfig.rotation.gracePeriod),
        status: 'active'
      };

      // Encrypt and store the key
      const storeResult = await this.storeKey(key);
      if (!storeResult.success) {
        return { success: false, error: storeResult.error };
      }

      log.info('Generated new JWT key', { keyId: key.id, expiresAt: key.expiresAt });
      return { success: true, data: key };
    } catch (error) {
      log.error('Failed to generate new JWT key', { error: formatError(error) });
      return { success: false, error: new Error('Failed to generate new JWT key') };
    }
  }

  /**
   * Stores a key in Redis (encrypted)
   */
  private async storeKey(key: JWTKey): Promise<Result<void>> {
    try {
      const keyData = JSON.stringify({
        ...key,
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt.toISOString()
      });

      const { encrypted, iv, authTag } = this.encryption.encrypt(keyData);
      
      const encryptedData = JSON.stringify({
        encrypted,
        iv,
        authTag,
        algorithm: jwtKeyConfig.encryption.algorithm
      });

      const redisKey = `${REDIS_KEYS.KEY_PREFIX}${key.id}`;
      const ttl = Math.floor((key.expiresAt.getTime() - Date.now()) / 1000);

      // Store the key with TTL
      await redisClient.setEx(redisKey, ttl, encryptedData);
      
      // Add to the set of all keys
      await redisClient.sAdd(REDIS_KEYS.ALL_KEYS, key.id);

      // If this is the first active key, set it as the signing key
      const currentSigningKey = await redisClient.get(REDIS_KEYS.ACTIVE_SIGNING_KEY);
      if (!currentSigningKey && key.status === 'active') {
        await redisClient.set(REDIS_KEYS.ACTIVE_SIGNING_KEY, key.id);
      }

      return { success: true, data: undefined };
    } catch (error) {
      log.error('Failed to store JWT key', { error: formatError(error), keyId: key.id });
      return { success: false, error: new Error('Failed to store JWT key') };
    }
  }

  /**
   * Retrieves and decrypts a key from Redis
   */
  async getKeyById(keyId: string): Promise<Result<JWTKey | null>> {
    try {
      const redisKey = `${REDIS_KEYS.KEY_PREFIX}${keyId}`;
      const encryptedData = await redisClient.get(redisKey);

      if (!encryptedData) {
        return { success: true, data: null };
      }

      const { encrypted, iv, authTag } = JSON.parse(encryptedData);
      const decrypted = this.encryption.decrypt(encrypted, iv, authTag);
      const keyData = JSON.parse(decrypted);

      const key: JWTKey = {
        ...keyData,
        createdAt: new Date(keyData.createdAt),
        expiresAt: new Date(keyData.expiresAt)
      };

      // Check if key is revoked
      const isRevoked = await redisClient.sIsMember(REDIS_KEYS.REVOKED_KEYS, keyId);
      if (isRevoked) {
        key.status = 'expired';
      }

      return { success: true, data: key };
    } catch (error) {
      log.error('Failed to retrieve JWT key', { error: formatError(error), keyId });
      return { success: false, error: new Error('Failed to retrieve JWT key') };
    }
  }

  /**
   * Returns all keys with status 'active' or 'rotating'
   */
  async getActiveKeys(): Promise<Result<JWTKey[]>> {
    try {
      const allKeyIds = await redisClient.sMembers(REDIS_KEYS.ALL_KEYS);
      const activeKeys: JWTKey[] = [];

      for (const keyId of allKeyIds) {
        const keyResult = await this.getKeyById(keyId);
        if (keyResult.success && keyResult.data) {
          const key = keyResult.data;
          
          // Check if key is still valid
          if (key.expiresAt > new Date() && 
              (key.status === 'active' || key.status === 'rotating')) {
            activeKeys.push(key);
          }
        }
      }

      // Sort by creation date (newest first)
      activeKeys.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return { success: true, data: activeKeys };
    } catch (error) {
      log.error('Failed to get active keys', { error: formatError(error) });
      return { success: false, error: new Error('Failed to get active keys') };
    }
  }

  /**
   * Gets the current signing key ID
   */
  async getCurrentSigningKeyId(): Promise<Result<string | null>> {
    try {
      const keyId = await redisClient.get(REDIS_KEYS.ACTIVE_SIGNING_KEY);
      return { success: true, data: keyId };
    } catch (error) {
      log.error('Failed to get current signing key ID', { error: formatError(error) });
      return { success: false, error: new Error('Failed to get current signing key ID') };
    }
  }

  /**
   * Rotates JWT keys
   */
  async rotateKeys(): Promise<Result<JWTKey>> {
    try {
      // Check if rotation is needed
      const activeKeysResult = await this.getActiveKeys();
      if (!activeKeysResult.success) {
        return { success: false, error: activeKeysResult.error };
      }

      const activeKeys = activeKeysResult.data;
      const currentSigningKeyId = await redisClient.get(REDIS_KEYS.ACTIVE_SIGNING_KEY);
      
      // Find the current signing key
      const currentKey = activeKeys.find(k => k.id === currentSigningKeyId);
      
      // Check if rotation is needed
      if (currentKey) {
        const keyAge = Date.now() - currentKey.createdAt.getTime();
        if (keyAge < jwtKeyConfig.rotation.interval) {
          log.info('Key rotation not needed yet', { 
            keyId: currentKey.id,
            ageInDays: Math.floor(keyAge / (24 * 60 * 60 * 1000))
          });
          return { success: true, data: currentKey };
        }
      }

      // Generate new key
      const newKeyResult = await this.generateNewKey();
      if (!newKeyResult.success) {
        return { success: false, error: newKeyResult.error };
      }

      const newKey = newKeyResult.data;

      // Transition old key to rotating status
      if (currentKey) {
        currentKey.status = 'rotating';
        await this.storeKey(currentKey);
      }

      // Set new key as active signing key
      await redisClient.set(REDIS_KEYS.ACTIVE_SIGNING_KEY, newKey.id);

      // Clean up expired keys
      await this.cleanupExpiredKeys();

      // Publish rotation event
      await redisClient.publish(REDIS_KEYS.PUBSUB_CHANNEL, JSON.stringify({
        event: 'key_rotated',
        newKeyId: newKey.id,
        oldKeyId: currentKey?.id,
        timestamp: new Date().toISOString()
      }));

      log.info('JWT key rotation completed', { 
        newKeyId: newKey.id,
        oldKeyId: currentKey?.id
      });

      return { success: true, data: newKey };
    } catch (error) {
      log.error('Failed to rotate JWT keys', { error: formatError(error) });
      return { success: false, error: new Error('Failed to rotate JWT keys') };
    }
  }

  /**
   * Cleans up expired keys
   */
  private async cleanupExpiredKeys(): Promise<void> {
    try {
      const allKeyIds = await redisClient.sMembers(REDIS_KEYS.ALL_KEYS);
      const activeKeysResult = await this.getActiveKeys();
      
      if (!activeKeysResult.success) {
        return;
      }

      const activeKeys = activeKeysResult.data;
      
      // Keep only the configured maximum number of active keys
      if (activeKeys.length > jwtKeyConfig.rotation.maxActiveKeys) {
        const keysToExpire = activeKeys.slice(jwtKeyConfig.rotation.maxActiveKeys);
        
        for (const key of keysToExpire) {
          key.status = 'expired';
          await this.storeKey(key);
          log.info('Expired old key due to max active keys limit', { keyId: key.id });
        }
      }

      // Remove keys that are past their TTL
      for (const keyId of allKeyIds) {
        const keyResult = await this.getKeyById(keyId);
        if (keyResult.success && keyResult.data) {
          const key = keyResult.data;
          if (key.expiresAt < new Date() || key.status === 'expired') {
            await redisClient.del(`${REDIS_KEYS.KEY_PREFIX}${keyId}`);
            await redisClient.sRem(REDIS_KEYS.ALL_KEYS, keyId);
            log.info('Cleaned up expired key', { keyId });
          }
        }
      }
    } catch (error) {
      log.error('Failed to cleanup expired keys', { error: formatError(error) });
    }
  }

  /**
   * Revokes a specific key
   */
  async revokeKey(keyId: string): Promise<Result<void>> {
    try {
      // Add to revoked set
      await redisClient.sAdd(REDIS_KEYS.REVOKED_KEYS, keyId);
      
      // Update key status
      const keyResult = await this.getKeyById(keyId);
      if (keyResult.success && keyResult.data) {
        const key = keyResult.data;
        key.status = 'expired';
        await this.storeKey(key);
      }

      // Publish revocation event
      await redisClient.publish(REDIS_KEYS.PUBSUB_CHANNEL, JSON.stringify({
        event: 'key_revoked',
        keyId,
        timestamp: new Date().toISOString()
      }));

      log.info('Revoked JWT key', { keyId });
      return { success: true, data: undefined };
    } catch (error) {
      log.error('Failed to revoke JWT key', { error: formatError(error), keyId });
      return { success: false, error: new Error('Failed to revoke JWT key') };
    }
  }

  /**
   * Checks if rotation is needed and performs it with distributed locking
   */
  async checkAndRotateKeys(): Promise<Result<void>> {
    const lockKey = REDIS_KEYS.ROTATION_LOCK;
    const lockTTL = 60; // 60 seconds
    
    try {
      // Try to acquire lock
      const lockId = randomUUID();
      const acquired = await redisClient.set(
        lockKey,
        lockId,
        {
          NX: true,
          EX: lockTTL
        }
      );

      if (!acquired) {
        log.debug('Another instance is already rotating keys');
        return { success: true, data: undefined };
      }

      try {
        // Perform rotation
        const result = await this.rotateKeys();
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: undefined };
      } finally {
        // Release lock (only if we still own it)
        const currentLockId = await redisClient.get(lockKey);
        if (currentLockId === lockId) {
          await redisClient.del(lockKey);
        }
      }
    } catch (error) {
      log.error('Failed to check and rotate keys', { error: formatError(error) });
      return { success: false, error: new Error('Failed to check and rotate keys') };
    }
  }

  /**
   * Registers the legacy JWT secret as a key
   */
  async registerLegacyKey(secret: string): Promise<Result<void>> {
    try {
      const legacyKey: JWTKey = {
        id: 'legacy-main-secret',
        secret,
        algorithm: 'HS256',
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        status: 'rotating'
      };

      const storeResult = await this.storeKey(legacyKey);
      if (!storeResult.success) {
        return { success: false, error: storeResult.error };
      }

      log.info('Registered legacy JWT key', { keyId: legacyKey.id, expiresAt: legacyKey.expiresAt });
      return { success: true, data: undefined };
    } catch (error) {
      log.error('Failed to register legacy JWT key', { error: formatError(error) });
      return { success: false, error: new Error('Failed to register legacy JWT key') };
    }
  }

  /**
   * Gets all keys (for admin purposes)
   */
  async getAllKeys(): Promise<Result<JWTKey[]>> {
    try {
      const allKeyIds = await redisClient.sMembers(REDIS_KEYS.ALL_KEYS);
      const keys: JWTKey[] = [];

      for (const keyId of allKeyIds) {
        const keyResult = await this.getKeyById(keyId);
        if (keyResult.success && keyResult.data) {
          keys.push(keyResult.data);
        }
      }

      // Sort by creation date (newest first)
      keys.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return { success: true, data: keys };
    } catch (error) {
      log.error('Failed to get all keys', { error: formatError(error) });
      return { success: false, error: new Error('Failed to get all keys') };
    }
  }
}

// Export singleton instance
export const jwtKeyService = new JWTKeyService();