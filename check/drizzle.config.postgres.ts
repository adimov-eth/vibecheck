import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: './src/database/schema.postgres.ts',
  out: './drizzle/postgres',
  dialect: 'postgresql',
  dbCredentials: {
    connectionString: process.env.POSTGRES_URL || 'postgresql://vibecheck_user:dev_password@localhost:5432/vibecheck_dev',
  },
  verbose: true,
  strict: true,
} satisfies Config;