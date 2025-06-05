import { config } from '@/config';
import { mkdir } from 'node:fs/promises';
import { formatError } from './error-formatter';
import { log } from './logger';
import { jwtKeyService } from '@/services/jwt-key-service';
import { initializeCacheServices } from '@/services/cache';

/**
 * Ensures all required directories exist
 */
export const initializeDirectories = async (): Promise<void> => {
  try {
    // Ensure uploads directory exists
    await mkdir(config.uploadsDir, { recursive: true });
    log.info("Ensured uploads directory exists", { path: config.uploadsDir });
  } catch (error) {
    log.error("Failed to initialize directories", { error: formatError(error) });
    throw error;
  }
};

/**
 * Initializes JWT key management system
 */
export const initializeJWTKeys = async (): Promise<void> => {
  try {
    // Register legacy JWT secret
    if (config.jwt.secret) {
      const result = await jwtKeyService.registerLegacyKey(config.jwt.secret);
      if (!result.success) {
        log.warn('Failed to register legacy JWT key', { error: formatError(result.error) });
      }
    }

    // Check if we have any active keys
    const activeKeysResult = await jwtKeyService.getActiveKeys();
    if (activeKeysResult.success) {
      const activeKeys = activeKeysResult.data;
      
      if (activeKeys.length === 0) {
        log.info('No active JWT keys found, generating initial key');
        const newKeyResult = await jwtKeyService.generateNewKey();
        
        if (!newKeyResult.success) {
          log.error('Failed to generate initial JWT key', { error: formatError(newKeyResult.error) });
          throw new Error('Failed to generate initial JWT key');
        }
        
        log.info('Generated initial JWT key', { keyId: newKeyResult.data.id });
      } else {
        log.info('JWT key system initialized', { 
          activeKeys: activeKeys.length,
          currentSigningKey: await jwtKeyService.getCurrentSigningKeyId().then(r => r.data)
        });
      }
    } else {
      log.error('Failed to check active JWT keys', { error: formatError(activeKeysResult.error) });
      throw new Error('Failed to check active JWT keys');
    }
  } catch (error) {
    log.error('Failed to initialize JWT keys', { error: formatError(error) });
    throw error;
  }
};

/**
 * Initializes cache services
 */
export const initializeCache = async (): Promise<void> => {
  try {
    await initializeCacheServices();
    log.info('Cache services initialized successfully');
  } catch (error) {
    log.error('Failed to initialize cache services', { error: formatError(error) });
    // Don't throw - app should work without cache
  }
}; 