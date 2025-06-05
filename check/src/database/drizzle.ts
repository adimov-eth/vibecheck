import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import Database from 'bun:sqlite';
import { log } from '../utils/logger';
import * as schema from './schema';
import { dbInstance as existingDb } from './index';

// Use the existing database connection
export const drizzleDb = drizzle(existingDb, { schema });

// Feature flag for Drizzle usage
export const DRIZZLE_ENABLED = process.env.USE_DRIZZLE === 'true';

// Migration helper
export async function runDrizzleMigrations() {
  try {
    log.info('Running Drizzle migrations...');
    await migrate(drizzleDb, { migrationsFolder: './drizzle' });
    log.info('Drizzle migrations completed');
  } catch (error) {
    log.error('Drizzle migration failed', { error });
    throw error;
  }
}

// Helper to determine which DB to use
export function shouldUseDrizzle(): boolean {
  return DRIZZLE_ENABLED;
}

// Export everything from schema for easy access
export * from './schema';

// Type-safe query builders
export const qb = {
  users: drizzleDb.select().from(schema.users),
  conversations: drizzleDb.select().from(schema.conversations),
  audios: drizzleDb.select().from(schema.audios),
  subscriptions: drizzleDb.select().from(schema.subscriptions),
} as const;