import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

export type DrizzleDB = BunSQLiteDatabase<typeof schema>; 