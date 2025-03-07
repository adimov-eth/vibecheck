import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL || 'voice-processing.db');
export const db = drizzle(sqlite, { schema });

// Migrations are handled separately
