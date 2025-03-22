import { getDbConnection, closeDbConnections } from '../index';
import { log } from '../../utils/logger.utils';
import { Database } from 'bun:sqlite';

async function addIndexes() {
  try {
    log('Starting database index creation migration...', 'info');
    
    // Get the Drizzle DB connection
    const dbConnection = getDbConnection();
    
    // Access the underlying SQLite connection
    const db = dbConnection._sqliteDb as Database;
    
    if (!db) {
      throw new Error('Could not access SQLite database instance');
    }

    // Create indexes for better query performance
    log('Adding indexes to users table...', 'info');
    db.exec(`CREATE INDEX IF NOT EXISTS email_idx ON users(email);`);
    
    log('Adding indexes to conversations table...', 'info');
    db.exec(`CREATE INDEX IF NOT EXISTS conversation_user_id_idx ON conversations(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS conversation_user_status_idx ON conversations(user_id, status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS conversation_created_at_idx ON conversations(created_at);`);
    
    log('Adding indexes to audios table...', 'info');
    db.exec(`CREATE INDEX IF NOT EXISTS audio_conversation_id_idx ON audios(conversation_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS audio_user_id_idx ON audios(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS audio_status_idx ON audios(status);`);
    
    log('Adding indexes to subscriptions table...', 'info');
    db.exec(`CREATE INDEX IF NOT EXISTS subscription_user_id_idx ON subscriptions(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS subscription_active_idx ON subscriptions(is_active);`);
    db.exec(`CREATE INDEX IF NOT EXISTS subscription_user_active_idx ON subscriptions(user_id, is_active);`);
    db.exec(`CREATE INDEX IF NOT EXISTS subscription_expires_date_idx ON subscriptions(expires_date);`);
    
    // Enable WAL mode for better concurrent access
    log('Enabling WAL mode for better performance...', 'info');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA cache_size = -64000'); // 64MB cache
    db.exec('PRAGMA mmap_size = 536870912'); // 512MB mmap
    db.exec('PRAGMA temp_store = MEMORY');
    
    log('Database optimization migration completed successfully', 'info');

    // Release the connection back to the pool
    dbConnection.release();
  } catch (error) {
    log(`Error during database optimization migration: ${error}`, 'error');
    throw error;
  } finally {
    // Don't close connections here as it will close the default connection used by the application
    // await closeDbConnections();
  }
}

// When this script is executed directly
if (import.meta.main) {
  addIndexes()
    .then(() => {
      log('Migration completed successfully', 'info');
      process.exit(0);
    })
    .catch((error) => {
      log(`Migration failed: ${error}`, 'error');
      process.exit(1);
    });
}

export default addIndexes;