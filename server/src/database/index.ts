import { Database } from 'bun:sqlite';
import { BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { logger } from '../utils/logger.utils';
import * as schema from './schema';

// Database configuration
const DATABASE_PATH = process.env.DATABASE_URL || 'voice-processing.db';
const POOL_SIZE = Number(process.env.DB_POOL_SIZE) || 50;

const PRAGMAS = {
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  foreign_keys: 'ON',
  cache_size: -64000,
  mmap_size: 536870912,
  temp_store: 'MEMORY',
  busy_timeout: 5000,
};

class ConnectionPool {
  private connections: Database[];
  private inUse: Set<Database>;

  constructor(dbPath: string, size: number) {
    this.connections = [];
    this.inUse = new Set();
    for (let i = 0; i < size; i++) {
      const conn = new Database(dbPath);
      for (const [pragma, value] of Object.entries(PRAGMAS)) {
        conn.exec(`PRAGMA ${pragma} = ${value}`);
      }
      this.connections.push(conn);
    }
  }

  acquire(): Database {
    const availableConn = this.connections.find(conn => !this.inUse.has(conn));
    if (!availableConn) {
      logger.warn('No available connections in pool, creating new connection');
      const newConn = new Database(DATABASE_PATH);
      for (const [pragma, value] of Object.entries(PRAGMAS)) {
        newConn.exec(`PRAGMA ${pragma} = ${value}`);
      }
      this.connections.push(newConn);
      this.inUse.add(newConn);
      logger.debug(`Created new connection. In use: ${this.inUse.size}, Available: ${this.available}, Total: ${this.size}`);
      return newConn;
    }
    this.inUse.add(availableConn);
    logger.debug(`Connections - In use: ${this.inUse.size}, Available: ${this.available}, Total: ${this.size}`);
    return availableConn;
  }

  release(conn: Database): void {
    if (this.inUse.has(conn)) {
      this.inUse.delete(conn);
      logger.debug(`Connection released - In use: ${this.inUse.size}, Available: ${this.available}, Total: ${this.size}`);
    }
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

const pool = new ConnectionPool(DATABASE_PATH, POOL_SIZE);
logger.info(`SQLite connection pool initialized with ${POOL_SIZE} connections`);

export type PooledDatabase = BunSQLiteDatabase<typeof schema> & {
  _sqliteDb: Database;
  release: () => void;
  released?: boolean;
};

export const getDbConnection = (): PooledDatabase => {
  const sqliteDb = pool.acquire();
  const drizzleDb = drizzle(sqliteDb, { schema }) as unknown as PooledDatabase;
  drizzleDb._sqliteDb = sqliteDb;
  drizzleDb.release = () => pool.release(sqliteDb);
  return drizzleDb;
};

export async function withDbConnection<T>(fn: (db: PooledDatabase) => Promise<T>): Promise<T> {
  const db = getDbConnection();
  try {
    return await fn(db);
  } finally {
    db.release();
  }
}

export const shutdownDb = async (): Promise<void> => {
  pool.close();
  logger.info('Database connection pool closed successfully');
};

// Ensure shutdown on process termination
process.on('SIGINT', async () => {
  await shutdownDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdownDb();
  process.exit(0);
});