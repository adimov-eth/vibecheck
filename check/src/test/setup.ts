import { beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../database/migrations';
import type { Redis } from 'redis';

// Test database setup
let testDb: Database | null = null;

export const setupTestDb = async () => {
  // Use in-memory SQLite for tests
  process.env.DATABASE_URL = ':memory:';
  process.env.NODE_ENV = 'test';
  
  // Run migrations
  await runMigrations();
};

export const getTestDb = () => {
  if (!testDb) {
    testDb = new Database(':memory:');
  }
  return testDb;
};

// Mock function type for Bun
type MockFunction<T extends (...args: any[]) => any> = T & {
  mock: {
    calls: Array<Parameters<T>>;
    results: Array<{ type: 'return' | 'throw'; value: any }>;
  };
  mockClear(): void;
  mockReset(): void;
  mockRestore(): void;
  mockImplementation(fn: T): void;
  mockImplementationOnce(fn: T): void;
  mockResolvedValue(value: any): void;
  mockResolvedValueOnce(value: any): void;
  mockRejectedValue(value: any): void;
  mockRejectedValueOnce(value: any): void;
};

// Mock Redis client
export interface MockRedisClient {
  get: MockFunction<(key: string) => Promise<string | null>>;
  set: MockFunction<(key: string, value: string, options?: any) => Promise<string>>;
  setEx: MockFunction<(key: string, seconds: number, value: string) => Promise<string>>;
  del: MockFunction<(key: string | string[]) => Promise<number>>;
  expire: MockFunction<(key: string, seconds: number) => Promise<number>>;
  exists: MockFunction<(key: string | string[]) => Promise<number>>;
  incr: MockFunction<(key: string) => Promise<number>>;
  decr: MockFunction<(key: string) => Promise<number>>;
  hGet: MockFunction<(key: string, field: string) => Promise<string | null>>;
  hSet: MockFunction<(key: string, field: string, value: string) => Promise<number>>;
  hGetAll: MockFunction<(key: string) => Promise<Record<string, string>>>;
  sAdd: MockFunction<(key: string, ...members: string[]) => Promise<number>>;
  sRem: MockFunction<(key: string, ...members: string[]) => Promise<number>>;
  sMembers: MockFunction<(key: string) => Promise<string[]>>;
  sIsMember: MockFunction<(key: string, member: string) => Promise<boolean>>;
  publish: MockFunction<(channel: string, message: string) => Promise<number>>;
  subscribe: MockFunction<(channel: string) => Promise<void>>;
  unsubscribe: MockFunction<(channel?: string) => Promise<void>>;
  quit: MockFunction<() => Promise<string>>;
  duplicate: MockFunction<() => MockRedisClient>;
}

export const createMockRedis = (): MockRedisClient & { _data: Map<string, any> } => {
  const dataStore = new Map<string, any>();
  
  const mockRedis = {
    _data: dataStore,
    get: mock(async (key: string) => dataStore.get(key) || null),
    set: mock(async (key: string, value: string) => {
      dataStore.set(key, value);
      return 'OK';
    }),
    setEx: mock(async (key: string, seconds: number, value: string) => {
      dataStore.set(key, value);
      // Note: In real implementation, we'd handle expiration
      return 'OK';
    }),
    del: mock(async (key: string) => {
      const existed = dataStore.has(key);
      dataStore.delete(key);
      return existed ? 1 : 0;
    }),
    expire: mock(async () => 1),
    exists: mock(async (key: string) => dataStore.has(key) ? 1 : 0),
    incr: mock(async (key: string) => {
      const current = parseInt(dataStore.get(key) || '0', 10);
      const newVal = current + 1;
      dataStore.set(key, newVal.toString());
      return newVal;
    }),
    decr: mock(async (key: string) => {
      const current = parseInt(dataStore.get(key) || '0', 10);
      const newVal = current - 1;
      dataStore.set(key, newVal.toString());
      return newVal;
    }),
    hGet: mock(async (key: string, field: string) => {
      const hash = dataStore.get(key) || {};
      return hash[field] || null;
    }),
    hSet: mock(async (key: string, field: string, value: string) => {
      const hash = dataStore.get(key) || {};
      hash[field] = value;
      dataStore.set(key, hash);
      return 1;
    }),
    hGetAll: mock(async (key: string) => {
      return dataStore.get(key) || {};
    }),
    sAdd: mock(async (key: string, ...members: string[]) => {
      const set = dataStore.get(key) || new Set<string>();
      let added = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          added++;
        }
      }
      dataStore.set(key, set);
      return added;
    }),
    sRem: mock(async (key: string, ...members: string[]) => {
      const set = dataStore.get(key) || new Set<string>();
      let removed = 0;
      for (const member of members) {
        if (set.delete(member)) {
          removed++;
        }
      }
      dataStore.set(key, set);
      return removed;
    }),
    sMembers: mock(async (key: string) => {
      const set = dataStore.get(key) || new Set<string>();
      return Array.from(set);
    }),
    sIsMember: mock(async (key: string, member: string) => {
      const set = dataStore.get(key) || new Set<string>();
      return set.has(member);
    }),
    publish: mock(async () => 1),
    subscribe: mock(async () => undefined),
    unsubscribe: mock(async () => undefined),
    quit: mock(async () => 'OK'),
    duplicate: mock(() => createMockRedis())
  };
  
  return mockRedis;
};

let mockRedisInstance: MockRedisClient | null = null;

export const setupMockRedis = () => {
  mockRedisInstance = createMockRedis();
  // Note: In tests, we'll need to import this mock and use it directly
  // or use dependency injection to override the redis client
  return mockRedisInstance;
};

export const getMockRedis = () => {
  if (!mockRedisInstance) {
    mockRedisInstance = createMockRedis();
  }
  return mockRedisInstance;
};

// Test data cleanup
export const cleanupTestData = async () => {
  if (testDb) {
    // Clear all tables
    const tables = ['users', 'conversations', 'sessions', 'subscriptions', 'usage_records'];
    for (const table of tables) {
      try {
        testDb.run(`DELETE FROM ${table}`);
      } catch (e) {
        // Table might not exist
      }
    }
  }
  
  // Clear mock Redis
  if (mockRedisInstance) {
    (mockRedisInstance as any)._data.clear();
    // Reset all mocks
    Object.values(mockRedisInstance).forEach(mock => {
      if (typeof mock === 'function' && 'mockClear' in mock) {
        mock.mockClear();
      }
    });
  }
};

// Global test utilities
export const testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateId: (prefix = 'test') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  createTestUser: async (overrides: Partial<any> = {}) => {
    const id = overrides.id || `apple:${testUtils.generateId('user')}`;
    const email = overrides.email || `${testUtils.generateId()}@test.com`;
    
    const db = getTestDb();
    const result = db.run(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, datetime(), datetime())',
      [id, email]
    );
    
    return {
      id,
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  },
  
  createTestConversation: async (overrides: Partial<any> = {}) => {
    const id = overrides.id || testUtils.generateId('conv');
    const userId = overrides.userId || `apple:${testUtils.generateId('user')}`;
    
    const db = getTestDb();
    const result = db.run(
      'INSERT INTO conversations (id, user_id, created_at, updated_at) VALUES (?, ?, datetime(), datetime())',
      [id, userId]
    );
    
    return {
      id,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }
};

// Environment setup for tests
export const setupTestEnvironment = () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.APPLE_TEAM_ID = 'test-team-id';
  process.env.APPLE_BUNDLE_ID = 'com.test.app';
  process.env.APPLE_KEY_ID = 'test-key-id';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long';
  process.env.LOG_LEVEL = 'error'; // Quiet logs during tests
};

// Export a convenience function for setting up everything
export const setupTests = async () => {
  setupTestEnvironment();
  await setupTestDb();
  const mockRedis = setupMockRedis();
  
  return {
    db: getTestDb(),
    redis: mockRedis,
    utils: testUtils
  };
};

// Global hooks for all tests
beforeAll(async () => {
  setupTestEnvironment();
});

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  // Close database connection
  if (testDb) {
    testDb.close();
    testDb = null;
  }
  
  // Clear Redis mock
  if (mockRedisInstance) {
    await mockRedisInstance.quit();
    mockRedisInstance = null;
  }
});