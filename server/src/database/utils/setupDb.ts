import { log } from '../../utils/logger.utils';
import addIndexes from '../migrations/add_indexes';
import optimizeDatabase from '../migrations/optimize_database';
import testTransactions from './transactionTest';
import { withDbConnection } from '../index';

async function setupDatabase() {
  try {
    log('Starting database setup...', 'info');

    log('Running migrations...', 'info');
    await withDbConnection(addIndexes);

    log('Optimizing database...', 'info');
    await withDbConnection(optimizeDatabase);

    log('Testing database connection pool and transactions...', 'info');
    await testTransactions();

    log('Database setup completed successfully', 'info');
    return true;
  } catch (error) {
    log(`Database setup failed: ${error}`, 'error');
    return false;
  }
}

if (require.main === module) {
  setupDatabase()
    .then((success) => {
      if (success) process.exit(0);
      else process.exit(1);
    })
    .catch((error) => {
      log(`Unexpected error during database setup: ${error}`, 'error');
      process.exit(1);
    });
}

export default setupDatabase;