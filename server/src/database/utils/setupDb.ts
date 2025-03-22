import { log } from '../../utils/logger.utils';
import addIndexes from '../migrations/add_indexes';
import optimizeDatabase from '../migrations/optimize_database';
import testTransactions from './transactionTest';
import { initializeDb } from '../index';

async function setupDatabase() {
  try {
    log('Starting database setup...', 'info');
    
    // Initialize default database connection first
    log('Initializing default database connection...', 'info');
    await initializeDb();
    
    // Run migrations
    log('Running migrations...', 'info');
    await addIndexes();
    
    // Optimize the database
    log('Optimizing database...', 'info');
    await optimizeDatabase();
    
    // Test transactions and connection pool
    log('Testing database connection pool and transactions...', 'info');
    await testTransactions();
    
    log('Database setup completed successfully', 'info');
    return true;
  } catch (error) {
    log(`Database setup failed: ${error}`, 'error');
    return false;
  }
}

// When this script is executed directly
if (require.main === module) {
  setupDatabase()
    .then((success) => {
      if (success) {
        log('Database setup completed successfully', 'info');
        process.exit(0);
      } else {
        log('Database setup failed', 'error');
        process.exit(1);
      }
    })
    .catch((error) => {
      log(`Unexpected error during database setup: ${error}`, 'error');
      process.exit(1);
    });
}

export default setupDatabase; 