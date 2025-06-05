#!/usr/bin/env bun
// Script to gradually migrate from raw SQL to Drizzle ORM

import { log } from '../utils/logger';
import { query, queryOne } from '../database';
import { drizzleDb, shouldUseDrizzle } from '../database/drizzle';
import { adapter } from '../database/adapter';

async function verifyDrizzleSetup() {
  log.info('Verifying Drizzle setup...');
  
  try {
    // Test basic queries with both systems
    const tests = [
      {
        name: 'Count users',
        rawSql: async () => {
          const result = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users', []);
          return result?.count || 0;
        },
        drizzle: async () => {
          const result = await drizzleDb.select({ count: sql<number>`COUNT(*)` }).from(users);
          return result[0]?.count || 0;
        }
      },
      {
        name: 'Count conversations',
        rawSql: async () => {
          const result = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM conversations', []);
          return result?.count || 0;
        },
        drizzle: async () => {
          const result = await drizzleDb.select({ count: sql<number>`COUNT(*)` }).from(conversations);
          return result[0]?.count || 0;
        }
      }
    ];

    for (const test of tests) {
      const rawResult = await test.rawSql();
      const drizzleResult = await test.drizzle();
      
      if (rawResult !== drizzleResult) {
        log.error(`Test "${test.name}" failed: Raw SQL returned ${rawResult}, Drizzle returned ${drizzleResult}`);
        return false;
      }
      
      log.info(`Test "${test.name}" passed: ${rawResult} records`);
    }

    return true;
  } catch (error) {
    log.error('Drizzle verification failed', { error });
    return false;
  }
}

async function comparePerformance() {
  log.info('Comparing performance...');
  
  const iterations = 100;
  const testUserId = 'test-user-id';
  
  // Test raw SQL performance
  const rawStart = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    await query('SELECT * FROM conversations WHERE userId = ? ORDER BY createdAt DESC LIMIT 10', [testUserId]);
  }
  const rawEnd = Bun.nanoseconds();
  const rawTime = (rawEnd - rawStart) / 1_000_000; // Convert to milliseconds
  
  // Test Drizzle performance
  const drizzleStart = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) {
    await adapter.findUserConversations(testUserId);
  }
  const drizzleEnd = Bun.nanoseconds();
  const drizzleTime = (drizzleEnd - drizzleStart) / 1_000_000;
  
  log.info('Performance results', {
    iterations,
    rawSql: `${rawTime.toFixed(2)}ms total, ${(rawTime / iterations).toFixed(2)}ms per query`,
    drizzle: `${drizzleTime.toFixed(2)}ms total, ${(drizzleTime / iterations).toFixed(2)}ms per query`,
    difference: `${((drizzleTime - rawTime) / rawTime * 100).toFixed(1)}%`
  });
}

async function main() {
  log.info('Starting Drizzle migration verification');
  
  // Check current status
  const usingDrizzle = shouldUseDrizzle();
  log.info(`Current Drizzle status: ${usingDrizzle ? 'ENABLED' : 'DISABLED'}`);
  
  if (!usingDrizzle) {
    log.info('To enable Drizzle, set USE_DRIZZLE=true in your environment');
  }
  
  // Verify setup
  const setupValid = await verifyDrizzleSetup();
  if (!setupValid) {
    log.error('Drizzle setup verification failed!');
    process.exit(1);
  }
  
  // Compare performance
  await comparePerformance();
  
  // Migration checklist
  log.info('\nMigration Checklist:');
  log.info('1. [✓] Install Drizzle dependencies');
  log.info('2. [✓] Create schema definitions');
  log.info('3. [✓] Create database adapter');
  log.info('4. [✓] Create service wrappers');
  log.info('5. [ ] Update all services to use adapter');
  log.info('6. [ ] Run tests with USE_DRIZZLE=true');
  log.info('7. [ ] Deploy with feature flag disabled');
  log.info('8. [ ] Gradually enable in production');
  log.info('9. [ ] Remove legacy code');
  
  log.info('\nNext steps:');
  log.info('1. Run: bun install');
  log.info('2. Run: bun db:generate');
  log.info('3. Test with: USE_DRIZZLE=true bun dev');
  log.info('4. Update remaining services to use adapter');
}

// Import after defining functions to avoid circular dependencies
import { users, conversations } from '../database/drizzle';
import { sql } from 'drizzle-orm';

main().catch((error) => {
  log.error('Migration script failed', { error });
  process.exit(1);
});