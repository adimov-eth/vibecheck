import { getDbConnection, closeDbConnections } from '../index';
import { log } from '../../utils/logger.utils';
import Database from 'better-sqlite3';

/**
 * Applies performance optimizations to the SQLite database
 */
async function optimizeDatabase() {
  try {
    log('Starting database optimization...', 'info');
    
    // Get the Drizzle DB connection
    const dbConnection = await getDbConnection();
    
    // Access the underlying better-sqlite3 connection
    // @ts-ignore - Access the underlying SQLite connection
    const db = dbConnection.driver?.db as Database;
    
    if (!db) {
      throw new Error('Could not access SQLite database instance');
    }
    
    // Run ANALYZE to update statistics used by the query planner
    log('Running ANALYZE to update query statistics...', 'info');
    db.exec('ANALYZE;');
    
    // Optimize the database to reduce fragmentation
    log('Running VACUUM to defragment the database...', 'info');
    db.exec('VACUUM;');
    
    // Enable integrity checks
    log('Running integrity check...', 'info');
    const integrityCheck = db.prepare('PRAGMA integrity_check;').all();
    if (integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok') {
      log('Database integrity verified', 'info');
    } else {
      log(`Database integrity issues found: ${JSON.stringify(integrityCheck)}`, 'warn');
    }
    
    // Report database size
    const pageSize = db.prepare('PRAGMA page_size;').get().page_size;
    const pageCount = db.prepare('PRAGMA page_count;').get().page_count;
    const databaseSizeBytes = pageSize * pageCount;
    const databaseSizeMB = (databaseSizeBytes / (1024 * 1024)).toFixed(2);
    
    log(`Database size: ${databaseSizeMB} MB (${databaseSizeBytes} bytes)`, 'info');
    log(`Page size: ${pageSize} bytes, Page count: ${pageCount}`, 'info');
    
    // Additional optimizations for future queries
    db.pragma('optimize');
    
    log('Database optimization completed successfully', 'info');
  } catch (error) {
    log(`Error during database optimization: ${error}`, 'error');
    throw error;
  } finally {
    await closeDbConnections();
  }
}

// When this script is executed directly
if (require.main === module) {
  optimizeDatabase()
    .then(() => {
      log('Optimization completed successfully', 'info');
      process.exit(0);
    })
    .catch((error) => {
      log(`Optimization failed: ${error}`, 'error');
      process.exit(1);
    });
}

export default optimizeDatabase; 