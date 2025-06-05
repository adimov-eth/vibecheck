#!/usr/bin/env bun
import { jwtKeyService, jwtKeyConfig } from '@/services/jwt-key-service';
import { log } from '@/utils/logger';
import { formatError } from '@/utils/error-formatter';
import { redisClient } from '@/config';

/**
 * JWT Key Rotation Scheduler
 * 
 * This script runs periodically to check and rotate JWT keys.
 * It can be run as a standalone process or integrated into the main application.
 */

const SCHEDULER_NAME = 'jwt-key-rotation-scheduler';

/**
 * Main scheduler function
 */
async function runScheduler() {
  log.info(`${SCHEDULER_NAME} started`, {
    checkInterval: jwtKeyConfig.rotation.checkInterval,
    rotationInterval: jwtKeyConfig.rotation.interval
  });

  // Initial check on startup
  await performRotationCheck();

  // Schedule periodic checks
  const intervalId = setInterval(async () => {
    await performRotationCheck();
  }, jwtKeyConfig.rotation.checkInterval);

  // Graceful shutdown
  const shutdown = async () => {
    log.info(`${SCHEDULER_NAME} shutting down...`);
    clearInterval(intervalId);
    
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Performs the rotation check
 */
async function performRotationCheck() {
  try {
    log.debug(`${SCHEDULER_NAME} performing rotation check`);
    
    const result = await jwtKeyService.checkAndRotateKeys();
    
    if (!result.success) {
      log.error(`${SCHEDULER_NAME} rotation check failed`, {
        error: formatError(result.error)
      });
      return;
    }

    // Log current key status
    const activeKeysResult = await jwtKeyService.getActiveKeys();
    if (activeKeysResult.success) {
      const activeKeys = activeKeysResult.data;
      const signingKeyResult = await jwtKeyService.getCurrentSigningKeyId();
      
      log.info(`${SCHEDULER_NAME} rotation check completed`, {
        activeKeys: activeKeys.length,
        currentSigningKey: signingKeyResult.success ? signingKeyResult.data : null,
        keyAges: activeKeys.map(k => ({
          id: k.id,
          ageInDays: Math.floor((Date.now() - k.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
          status: k.status
        }))
      });
    }
  } catch (error) {
    log.error(`${SCHEDULER_NAME} unexpected error during rotation check`, {
      error: formatError(error)
    });
  }
}

// Run the scheduler if this file is executed directly
if (import.meta.main) {
  runScheduler().catch(error => {
    log.error(`${SCHEDULER_NAME} failed to start`, {
      error: formatError(error)
    });
    process.exit(1);
  });
}

export { runScheduler, performRotationCheck };