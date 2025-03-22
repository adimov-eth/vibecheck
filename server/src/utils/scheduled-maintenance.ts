import { log } from './logger.utils';
import optimizeDatabase from '../database/migrations/optimize_database';
import { withDbConnection } from '../database';

// Interval in milliseconds (default: 24 hours)
const MAINTENANCE_INTERVAL = process.env.MAINTENANCE_INTERVAL_MS 
  ? parseInt(process.env.MAINTENANCE_INTERVAL_MS, 10)
  : 24 * 60 * 60 * 1000;

// Time of day to run maintenance (default: 3 AM)
const MAINTENANCE_HOUR = process.env.MAINTENANCE_HOUR
  ? parseInt(process.env.MAINTENANCE_HOUR, 10)
  : 3;

/**
 * Calculates the delay until the next maintenance window
 */
function getNextMaintenanceDelay(): number {
  const now = new Date();
  const targetHour = MAINTENANCE_HOUR;
  
  // Calculate the next maintenance time
  const nextMaintenance = new Date(now);
  nextMaintenance.setHours(targetHour, 0, 0, 0);
  
  // If that time has already passed today, move to tomorrow
  if (nextMaintenance <= now) {
    nextMaintenance.setDate(nextMaintenance.getDate() + 1);
  }
  
  return nextMaintenance.getTime() - now.getTime();
}

/**
 * Runs the scheduled maintenance tasks
 */
async function runMaintenance() {
  try {
    log('Starting scheduled database maintenance...', 'info');
    
    // Run database optimization with a proper database connection
    await withDbConnection(optimizeDatabase);
    
    log('Scheduled maintenance completed successfully', 'info');
  } catch (error) {
    log(`Error during scheduled maintenance: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
  
  // Schedule the next maintenance run
  scheduleNextMaintenance();
}

/**
 * Schedules the next maintenance run
 */
function scheduleNextMaintenance() {
  const delay = getNextMaintenanceDelay();
  const nextMaintenanceDate = new Date(Date.now() + delay);
  
  log(`Next maintenance scheduled at ${nextMaintenanceDate.toLocaleString()}`, 'info');
  
  // Schedule the next maintenance run
  setTimeout(() => {
    runMaintenance();
  }, delay);
}

/**
 * Initializes the scheduled maintenance
 */
export function initScheduledMaintenance() {
  log('Initializing scheduled database maintenance...', 'info');
  scheduleNextMaintenance();
}

export default initScheduledMaintenance;