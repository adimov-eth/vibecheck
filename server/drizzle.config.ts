import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/database/schema.ts',
  dbCredentials: {
    url: './voice-processing.db',
  },
  verbose: true,
  strict: true,
});
