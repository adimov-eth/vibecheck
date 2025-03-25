import { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.utils';
import { PooledDatabase } from '../index';

interface IntegrityCheckResult {
  integrity_check: string;
}

interface PragmaResult {
  page_size: number;
  page_count: number;
}

async function optimizeDatabase(db: PooledDatabase) {
  const sqliteDb = db._sqliteDb as Database;

  logger.info('Starting database optimization...');

  logger.info('Running ANALYZE to update query statistics...');
  sqliteDb.exec('ANALYZE;');

  logger.info('Running VACUUM to defragment the database...');
  sqliteDb.exec('VACUUM;');

  logger.info('Running integrity check...');
  const integrityCheck = sqliteDb.query('PRAGMA integrity_check;').all() as IntegrityCheckResult[];
  if (integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok') {
    logger.info('Database integrity verified');
  } else {
    logger.warn(`Database integrity issues found: ${JSON.stringify(integrityCheck)}`);
  }

  const pageSize = (sqliteDb.query('PRAGMA page_size;').get() as PragmaResult).page_size;
  const pageCount = (sqliteDb.query('PRAGMA page_count;').get() as PragmaResult).page_count;
  const databaseSizeBytes = pageSize * pageCount;
  const databaseSizeMB = (databaseSizeBytes / (1024 * 1024)).toFixed(2);

  logger.info(`Database size: ${databaseSizeMB} MB (${databaseSizeBytes} bytes)`);
  logger.info(`Page size: ${pageSize} bytes, Page count: ${pageCount}`);

  sqliteDb.exec('PRAGMA optimize;');

  logger.info('Database optimization completed successfully');
}

if (import.meta.main) {
  import('../index').then(({ withDbConnection }) => {
    withDbConnection(optimizeDatabase)
      .then(() => {
        logger.info('Optimization completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error(`Optimization failed: ${error}`);
        process.exit(1);
      });
  });
}

export default optimizeDatabase;