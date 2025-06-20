import { cacheService } from './cache-service';
import { cacheWarmer } from './cache-warmer';
import { cacheMetrics } from './cache-metrics';
import { log } from '@/utils/logger';

// Use setTimeout instead of node-schedule for now
const FIFTEEN_MINUTES = 15 * 60 * 1000;

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
    
    // Schedule metrics logging with setInterval instead of node-schedule
    setInterval(async () => {
      await cacheMetrics.logMetrics();
    }, FIFTEEN_MINUTES);
    
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