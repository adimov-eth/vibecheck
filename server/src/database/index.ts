import { drizzle } from 'drizzle-orm/bun-sqlite';
import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';
import { log } from '../utils/logger.utils';

// Database configuration
const DATABASE_PATH = process.env.DATABASE_URL || 'voice-processing.db';
const POOL_SIZE = 25;

// SQLite optimization pragmas
const PRAGMAS = {
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  foreign_keys: 'ON',
  cache_size: -64000, // 64MB cache, negative means kilobytes
  mmap_size: 536870912, // 512MB mmap
  temp_store: 'MEMORY',
  busy_timeout: 5000 // 5 second timeout for busy connections
};

// Simple connection pool implementation
class ConnectionPool {
  private connections: Database[];
  private inUse: Set<Database>;
  
  constructor(dbPath: string, size: number) {
    this.connections = [];
    this.inUse = new Set();
    
    // Initialize connections
    for (let i = 0; i < size; i++) {
      const conn = new Database(dbPath);
      
      // Apply pragmas to each connection
      for (const [pragma, value] of Object.entries(PRAGMAS)) {
        conn.exec(`PRAGMA ${pragma} = ${value}`);
      }
      
      this.connections.push(conn);
    }
  }
  
  acquire(): Database {
    const availableConn = this.connections.find(conn => !this.inUse.has(conn));
    
    if (!availableConn) {
      log('No available connections in pool, creating new connection', 'warn');
      const newConn = new Database(DATABASE_PATH);
      for (const [pragma, value] of Object.entries(PRAGMAS)) {
        newConn.exec(`PRAGMA ${pragma} = ${value}`);
      }
      this.connections.push(newConn);
      this.inUse.add(newConn);
      return newConn;
    }
    
    this.inUse.add(availableConn);
    return availableConn;
  }
  
  release(conn: Database): void {
    this.inUse.delete(conn);
  }
  
  close(): void {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections = [];
    this.inUse.clear();
  }
  
  get size(): number {
    return this.connections.length;
  }
  
  get available(): number {
    return this.connections.length - this.inUse.size;
  }
}

// Create connection pool
const pool = new ConnectionPool(DATABASE_PATH, POOL_SIZE);
log(`SQLite connection pool initialized with ${POOL_SIZE} connections`, 'info');

// Extended database type with release method
type PooledDatabase = BunSQLiteDatabase<typeof schema> & {
  _sqliteDb: Database;
  release: () => void;
};

// Get a connection from the pool
export const getDbConnection = (): PooledDatabase => {
  const sqliteDb = pool.acquire();
  const drizzleDb = drizzle(sqliteDb, { schema }) as unknown as PooledDatabase;
  
  // Add connection to the drizzle instance
  drizzleDb._sqliteDb = sqliteDb;
  
  // Add release method
  drizzleDb.release = () => {
    pool.release(sqliteDb);
  };
  
  return drizzleDb;
};

// Default connection for simpler use cases
let defaultConnection: PooledDatabase | null = null;

// Initialize default connection
export const initializeDb = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      defaultConnection = getDbConnection();
      log('Default database connection established', 'info');
      resolve();
    } catch (error) {
      log(`Failed to establish default database connection: ${error}`, 'error');
      reject(error);
    }
  });
};

// Export a proxy for simpler use
export const db = new Proxy({} as PooledDatabase, {
  get: (target, prop, receiver) => {
    if (!defaultConnection) {
      throw new Error('Database not initialized');
    }
    
    const value = Reflect.get(defaultConnection, prop, receiver);
    return typeof value === 'function' 
      ? value.bind(defaultConnection)
      : value;
  }
});

// Graceful shutdown helper
export const closeDbConnections = async (): Promise<void> => {
  try {
    if (defaultConnection) {
      defaultConnection.release();
      defaultConnection = null;
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