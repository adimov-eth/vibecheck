export { cacheService, CacheService, CacheOptions } from './cache-service';
export { userCacheService, UserCacheService } from './user-cache-service';
export { sessionCacheService, SessionCacheService } from './session-cache-service';
export { conversationCacheService, ConversationCacheService } from './conversation-cache-service';
export { openAICacheService, OpenAICacheService } from './openai-cache-service';
export { cacheWarmer, CacheWarmer } from './cache-warmer';
export { cacheMetrics, CacheMetrics } from './cache-metrics';

import { cacheService } from './cache-service';
import { cacheWarmer } from './cache-warmer';
import { cacheMetrics } from './cache-metrics';
import { log } from '@/utils/logger';
import { scheduleJob } from 'node-schedule';

/**
 * Initialize all cache services
 */
export async function initializeCacheServices(): Promise<void> {
  try {
    // Connect to Redis
    await cacheService.connect();
    log.info('Cache service initialized');
    
    // Connect metrics client
    await cacheMetrics.connect();
    log.info('Cache metrics initialized');
    
    // Schedule cache warming jobs
    cacheWarmer.scheduleWarmingJobs();
    
    // Schedule metrics logging
    scheduleJob('*/15 * * * *', async () => {
      await cacheMetrics.logMetrics();
    });
    
    // Initial system cache warming
    await cacheWarmer.warmSystemCache();
    
    log.info('All cache services initialized');
  } catch (error) {
    log.error('Failed to initialize cache services', error);
    // Don't throw - app should work without cache
  }
}

/**
 * Shutdown all cache services
 */
export async function shutdownCacheServices(): Promise<void> {
  try {
    await cacheService.disconnect();
    await cacheMetrics.disconnect();
    log.info('Cache services shut down');
  } catch (error) {
    log.error('Error shutting down cache services', error);
  }
}