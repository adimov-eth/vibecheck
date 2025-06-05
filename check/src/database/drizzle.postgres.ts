import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.postgres';
import { log } from '@/utils/logger';

// Connection configuration
const connectionString = process.env.POSTGRES_URL || 
  (process.env.NODE_ENV === 'test' 
    ? 'postgresql://vibecheck_user:dev_password@localhost:5432/vibecheck_test'
    : 'postgresql://vibecheck_user:dev_password@localhost:5432/vibecheck_dev');

// Create postgres client with connection pooling
const queryClient = postgres(connectionString, {
  max: 20, // Maximum number of connections
  idle_timeout: 20, // Seconds to wait before closing idle connections
  connect_timeout: 10, // Seconds to wait for connection
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  onnotice: (notice) => {
    if (process.env.NODE_ENV === 'development') {
      log.debug('[PostgreSQL Notice]', notice);
    }
  },
});

// Create drizzle instance
export const pgDb: PostgresJsDatabase<typeof schema> = drizzle(queryClient, { 
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// Export schema for use in other files
export * from './schema.postgres';

// Health check function
export async function checkPostgresConnection(): Promise<boolean> {
  try {
    const result = await queryClient`SELECT 1 as health_check`;
    return result.length > 0;
  } catch (error) {
    log.error('PostgreSQL connection check failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closePostgresConnection(): Promise<void> {
  try {
    await queryClient.end();
    log.info('PostgreSQL connection closed');
  } catch (error) {
    log.error('Error closing PostgreSQL connection:', error);
  }
}