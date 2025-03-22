import { drizzle } from 'drizzle-orm/better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Pool } from 'better-sqlite-pool';
import * as schema from './schema';
import { log } from '../utils/logger.utils';

// Connection pool configuration
const POOL_MAX_CONNECTIONS = 10; // Number of connections in the pool
const POOL_TIMEOUT = 30000; // 30 seconds timeout
const DATABASE_PATH = process.env.DATABASE_URL || 'voice-processing.db';

// SQLite optimization pragmas
const PRAGMAS = {
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  foreign_keys: 'ON',
  cache_size: -64000, // 64MB cache, negative means kilobytes
  mmap_size: 536870912, // 512MB mmap
  temp_store: 'MEMORY'
};

// Create a connection pool
const pool = new Pool(DATABASE_PATH, {
  max: POOL_MAX_CONNECTIONS,
  timeout: POOL_TIMEOUT
});

log(`SQLite connection pool initialized with ${POOL_MAX_CONNECTIONS} connections`, 'info');

// Extended database type that includes the release method
interface ExtendedDbInstance extends BetterSQLite3Database<typeof schema> {
  release?: () => void;
}

// Database initialization state
let defaultConnection: ExtendedDbInstance | null = null;
let initPromise: Promise<ExtendedDbInstance> | null = null;

// Get a drizzle-enabled connection from the pool
const getDbInstance = async (): Promise<ExtendedDbInstance> => {
  const conn = await pool.acquire();
  
  // Set optimization pragmas on the connection
  Object.entries(PRAGMAS).forEach(([pragma, value]) => {
    conn.pragma(`${pragma} = ${value}`);
  });
  
  // Add release method to connection for returning to pool
  const originalRelease = conn.release;
  conn.release = () => {
    if (originalRelease) {
      originalRelease.call(conn);
    }
  };
  
  // Create drizzle instance with our extended type
  return drizzle(conn, { schema }) as ExtendedDbInstance;
};

// Export a function to get a fresh database connection from the pool
export const getDbConnection = async (): Promise<ExtendedDbInstance> => {
  return getDbInstance();
};

// Initialize the database and return a promise
const initializeDb = (): Promise<ExtendedDbInstance> => {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      defaultConnection = await getDbInstance();
      log('Default database connection established', 'info');
      return defaultConnection;
    } catch (error) {
      log(`Failed to establish default database connection: ${error}`, 'error');
      process.exit(1);
    }
  })();

  return initPromise;
};

// Start initialization immediately
initializeDb();

// Export a proxy that ensures the database is initialized before use
export const db = new Proxy({} as ExtendedDbInstance, {
  get: (target, prop, receiver) => {
    // Ensure we have a connection before accessing properties
    return async (...args: any[]) => {
      const dbInstance = await initializeDb();
      const value = Reflect.get(dbInstance, prop, receiver);
      
      // Handle methods vs properties
      if (typeof value === 'function') {
        return value.apply(dbInstance, args);
      }
      
      return value;
    };
  }
});

// Graceful shutdown helper
export const closeDbConnections = async (): Promise<void> => {
  try {
    if (defaultConnection?.release) {
      defaultConnection.release();
    }
    pool.close();
    log('Database connection pool closed successfully', 'info');
  } catch (error) {
    log(`Error closing database connection pool: ${error}`, 'error');
  }
};

// Setup process exit handlers to clean up connections
process.on('SIGINT', async () => {
  await closeDbConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDbConnections();
  process.exit(0);
});

// Migrations are handled separately
