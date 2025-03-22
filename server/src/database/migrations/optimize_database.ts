import { getDbConnection, closeDbConnections } from '../index';
import { log } from '../../utils/logger.utils';
import { Database } from 'bun:sqlite';

/**
 * Applies performance optimizations to the SQLite database
 */
async function optimizeDatabase() {
  try {
    log('Starting database optimization...', 'info');
    
    // Get the Drizzle DB connection
    const dbConnection = getDbConnection();
    
    // Access the underlying SQLite connection
    const db = dbConnection._sqliteDb as Database;
    
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
    const integrityCheck = db.query('PRAGMA integrity_check;').all();
    if (integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok') {
      log('Database integrity verified', 'info');
    } else {
      log(`Database integrity issues found: ${JSON.stringify(integrityCheck)}`, 'warn');
    }
    
    // Report database size
    const pageSize = db.query('PRAGMA page_size;').get().page_size;
    const pageCount = db.query('PRAGMA page_count;').get().page_count;
    const databaseSizeBytes = pageSize * pageCount;
    const databaseSizeMB = (databaseSizeBytes / (1024 * 1024)).toFixed(2);
    
    log(`Database size: ${databaseSizeMB} MB (${databaseSizeBytes} bytes)`, 'info');
    log(`Page size: ${pageSize} bytes, Page count: ${pageCount}`, 'info');
    
    // Additional optimizations for future queries
    db.exec('PRAGMA optimize;');
    
    log('Database optimization completed successfully', 'info');

    // Release the connection back to the pool
    dbConnection.release();
  } catch (error) {
    log(`Error during database optimization: ${error}`, 'error');
    throw error;
  } finally {
    await closeDbConnections();
  }
}

// When this script is executed directly
if (import.meta.main) {
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