import { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.utils';
import { PooledDatabase } from '../index';

async function addIndexes(db: PooledDatabase) {
  const sqliteDb = db._sqliteDb as Database;

  logger.info('Starting database index creation migration...');

  logger.info('Adding indexes to users table...');
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS email_idx ON users(email);`);

  logger.info('Adding indexes to conversations table...');
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_user_id_idx ON conversations(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_user_status_idx ON conversations(user_id, status);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_created_at_idx ON conversations(created_at);`);

  logger.info('Adding indexes to audios table...');
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_conversation_id_idx ON audios(conversation_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_user_id_idx ON audios(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_status_idx ON audios(status);`);

  logger.info('Adding indexes to subscriptions table...');
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_user_id_idx ON subscriptions(user_id);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_active_idx ON subscriptions(is_active);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_user_active_idx ON subscriptions(user_id, is_active);`);
  sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_expires_date_idx ON subscriptions(expires_date);`);

  logger.info('Enabling WAL mode for better performance...');
  sqliteDb.exec('PRAGMA journal_mode = WAL');
  sqliteDb.exec('PRAGMA synchronous = NORMAL');
  sqliteDb.exec('PRAGMA cache_size = -64000');
  sqliteDb.exec('PRAGMA mmap_size = 536870912');
  sqliteDb.exec('PRAGMA temp_store = MEMORY');

  logger.info('Database optimization migration completed successfully');
}

if (import.meta.main) {
  import('../index').then(({ withDbConnection }) => {
    withDbConnection(addIndexes)
      .then(() => {
        logger.info('Migration completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        logger.error(`Migration failed: ${error}`);
        process.exit(1);
      });
  });
}

export default addIndexes;