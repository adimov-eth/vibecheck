import { logger } from '../../utils/logger.utils';
import { withDbConnection } from '../index';
import addIndexes from '../migrations/add_indexes';
import optimizeDatabase from '../migrations/optimize_database';
import testTransactions from './transactionTest';

async function setupDatabase() {
  try {
    logger.info('Starting database setup...');

    logger.info('Running migrations...');
    await withDbConnection(addIndexes);

    logger.info('Optimizing database...');
    await withDbConnection(optimizeDatabase);

    logger.info('Testing database connection pool and transactions...');
    await testTransactions();

    logger.info('Database setup completed successfully');
    return true;
  } catch (error) {
    logger.error(`Database setup failed: ${error}`);
    return false;
  }
}

if (require.main === module) {
  setupDatabase()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      logger.error(`Unexpected error during database setup: ${error}`);
      process.exit(1);
    });
}

export default setupDatabase;