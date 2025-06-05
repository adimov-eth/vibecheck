import { log } from '@/utils/logger';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  useDrizzle: boolean;
  connectionString?: string;
  postgresUrl?: string;
  sqliteUrl?: string;
}

function getDatabaseConfig(): DatabaseConfig {
  const databaseType = process.env.DATABASE_TYPE || 'sqlite';
  const useDrizzle = process.env.USE_DRIZZLE !== 'false';
  
  // Log configuration on startup
  log.info('Database configuration', {
    type: databaseType,
    useDrizzle,
    environment: process.env.NODE_ENV,
  });

  if (databaseType === 'postgres') {
    const postgresUrl = process.env.POSTGRES_URL || 
      (process.env.NODE_ENV === 'test' 
        ? 'postgresql://vibecheck_user:dev_password@localhost:5432/vibecheck_test'
        : 'postgresql://vibecheck_user:dev_password@localhost:5432/vibecheck_dev');
    
    return {
      type: 'postgres',
      useDrizzle: true, // Always use Drizzle with PostgreSQL
      postgresUrl,
      connectionString: postgresUrl,
    };
  }

  // SQLite configuration
  const sqliteUrl = process.env.DATABASE_URL || './app.db';
  
  return {
    type: 'sqlite',
    useDrizzle,
    sqliteUrl,
    connectionString: sqliteUrl,
  };
}

export const databaseConfig = getDatabaseConfig();

// Helper functions
export const usePostgres = () => databaseConfig.type === 'postgres';
export const useSqlite = () => databaseConfig.type === 'sqlite';
export const shouldUseDrizzle = () => databaseConfig.useDrizzle;