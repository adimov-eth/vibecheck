import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

// This script is executed when running "pnpm db:migrate"
async function main() {
  console.log('Running migrations...');

  // Initialize the SQLite database
  const sqlite = new Database(
    process.env.DATABASE_URL || 'voice-processing.db'
  );
  const db = drizzle(sqlite, { schema });

  // Run migrations
  await migrate(db, { migrationsFolder: './drizzle' });

  console.log('Migrations completed successfully!');
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
