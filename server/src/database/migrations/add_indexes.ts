import { PooledDatabase } from '../index';
import { log } from '../../utils/logger.utils';
import { Database } from 'bun:sqlite';

async function addIndexes(db: PooledDatabase) {
  try {
    log('Starting database index creation migration...', 'info');
    const sqliteDb = db._sqliteDb as Database;

    log('Adding indexes to users table...', 'info');
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS email_idx ON users(email);`);

    log('Adding indexes to conversations table...', 'info');
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_user_id_idx ON conversations(user_id);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_user_status_idx ON conversations(user_id, status);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS conversation_created_at_idx ON conversations(created_at);`);

    log('Adding indexes to audios table...', 'info');
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_conversation_id_idx ON audios(conversation_id);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_user_id_idx ON audios(user_id);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS audio_status_idx ON audios(status);`);

    log('Adding indexes to subscriptions table...', 'info');
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_user_id_idx ON subscriptions(user_id);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_active_idx ON subscriptions(is_active);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_user_active_idx ON subscriptions(user_id, is_active);`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS subscription_expires_date_idx ON subscriptions(expires_date);`);

    log('Enabling WAL mode for better performance...', 'info');
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    sqliteDb.exec('PRAGMA synchronous = NORMAL');
    sqliteDb.exec('PRAGMA cache_size = -64000');
    sqliteDb.exec('PRAGMA mmap_size = 536870912');
    sqliteDb.exec('PRAGMA temp_store = MEMORY');

    log('Database optimization migration completed successfully', 'info');
  } catch (error) {
    log(`Error during database optimization migration: ${error}`, 'error');
    throw error;
  }
}

if (import.meta.main) {
  import('../index').then(({ withDbConnection }) => {
    withDbConnection(addIndexes)
      .then(() => {
        log('Migration completed successfully', 'info');
        process.exit(0);
      })
      .catch((error) => {
        log(`Migration failed: ${error}`, 'error');
        process.exit(1);
      });
  });
}

export default addIndexes;