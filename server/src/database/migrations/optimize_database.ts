import { PooledDatabase } from '../index';
import { log } from '../../utils/logger.utils';
import { Database } from 'bun:sqlite';

interface IntegrityCheckResult {
  integrity_check: string;
}

interface PragmaResult {
  page_size: number;
  page_count: number;
}

async function optimizeDatabase(db: PooledDatabase) {
  try {
    log('Starting database optimization...', 'info');
    const sqliteDb = db._sqliteDb as Database;

    log('Running ANALYZE to update query statistics...', 'info');
    sqliteDb.exec('ANALYZE;');

    log('Running VACUUM to defragment the database...', 'info');
    sqliteDb.exec('VACUUM;');

    log('Running integrity check...', 'info');
    const integrityCheck = sqliteDb.query('PRAGMA integrity_check;').all() as IntegrityCheckResult[];
    if (integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok') {
      log('Database integrity verified', 'info');
    } else {
      log(`Database integrity issues found: ${JSON.stringify(integrityCheck)}`, 'warn');
    }

    const pageSize = (sqliteDb.query('PRAGMA page_size;').get() as PragmaResult).page_size;
    const pageCount = (sqliteDb.query('PRAGMA page_count;').get() as PragmaResult).page_count;
    const databaseSizeBytes = pageSize * pageCount;
    const databaseSizeMB = (databaseSizeBytes / (1024 * 1024)).toFixed(2);

    log(`Database size: ${databaseSizeMB} MB (${databaseSizeBytes} bytes)`, 'info');
    log(`Page size: ${pageSize} bytes, Page count: ${pageCount}`, 'info');

    sqliteDb.exec('PRAGMA optimize;');

    log('Database optimization completed successfully', 'info');
  } catch (error) {
    log(`Error during database optimization: ${error}`, 'error');
    throw error;
  }
}

if (import.meta.main) {
  import('../index').then(({ withDbConnection }) => {
    withDbConnection(optimizeDatabase)
      .then(() => {
        log('Optimization completed successfully', 'info');
        process.exit(0);
      })
      .catch((error) => {
        log(`Optimization failed: ${error}`, 'error');
        process.exit(1);
      });
  });
}

export default optimizeDatabase;