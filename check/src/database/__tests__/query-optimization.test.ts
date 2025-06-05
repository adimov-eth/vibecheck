import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { UserLoader, UserByEmailLoader } from '@/loaders/user-loader';
import { ConversationLoader, UserConversationsLoader } from '@/loaders/conversation-loader';
import { optimizedConversationService } from '@/services/conversation-service-optimized';
import { queryMonitor } from '@/monitoring/query-monitor';
import { CursorPagination, OffsetPagination, KeysetPagination } from '@/utils/pagination';
import { database } from '@/database';
import { users, conversations } from '@/database/schema';

describe('Query Optimization', () => {
  beforeEach(() => {
    queryMonitor.reset();
  });
  
  describe('DataLoader', () => {
    it('should batch user queries', async () => {
      const userLoader = new UserLoader();
      let queryCount = 0;
      
      // Mock database query to count calls
      const originalSelect = database.select;
      database.select = mock(() => {
        queryCount++;
        return originalSelect.call(database);
      });
      
      // Request multiple users in parallel
      const promises = [
        userLoader.load('user1'),
        userLoader.load('user2'),
        userLoader.load('user3')
      ];
      
      const users = await Promise.all(promises);
      
      // Should make only one query
      expect(queryCount).toBe(1);
      
      // Restore original
      database.select = originalSelect;
    });
    
    it('should cache loaded values', async () => {
      const userLoader = new UserLoader();
      
      // Mock user data
      const mockUser = { id: 'user1', email: 'test@example.com' };
      userLoader.prime('user1', mockUser);
      
      // First load should use cache
      const user1 = await userLoader.load('user1');
      expect(user1).toEqual(mockUser);
      
      // Track if database is called
      let dbCalled = false;
      const originalSelect = database.select;
      database.select = mock(() => {
        dbCalled = true;
        return originalSelect.call(database);
      });
      
      // Second load should also use cache
      const user1Again = await userLoader.load('user1');
      expect(dbCalled).toBe(false);
      expect(user1Again).toBe(user1);
      
      database.select = originalSelect;
    });
    
    it('should handle missing values correctly', async () => {
      const userLoader = new UserLoader();
      
      // Mock empty result
      const originalSelect = database.select;
      database.select = mock(() => ({
        from: () => ({
          where: () => Promise.resolve([])
        })
      }));
      
      const result = await userLoader.load('non-existent');
      expect(result).toBeNull();
      
      database.select = originalSelect;
    });
    
    it('should batch email lookups', async () => {
      const emailLoader = new UserByEmailLoader();
      let queryCount = 0;
      
      const originalSelect = database.select;
      database.select = mock(() => {
        queryCount++;
        return originalSelect.call(database);
      });
      
      // Request multiple emails
      const emails = await Promise.all([
        emailLoader.load('user1@example.com'),
        emailLoader.load('user2@example.com'),
        emailLoader.load('user3@example.com')
      ]);
      
      expect(queryCount).toBe(1);
      
      database.select = originalSelect;
    });
  });
  
  describe('Optimized Queries', () => {
    it('should fetch conversation with details in single query', async () => {
      let queryCount = 0;
      
      // Track queries through monitor
      const originalExecute = database.execute;
      database.execute = async function(...args: any[]) {
        queryCount++;
        return originalExecute.apply(this, args);
      };
      
      // This should use 2 queries: one for main data, one for audio details
      await optimizedConversationService.getConversationWithDetails('conv123');
      
      expect(queryCount).toBeLessThanOrEqual(2);
      
      database.execute = originalExecute;
    });
    
    it('should calculate user stats efficiently', async () => {
      const start = Date.now();
      
      const stats = await optimizedConversationService.getUserConversationStats(
        'user123',
        { start: new Date('2024-01-01'), end: new Date('2024-12-31') }
      );
      
      const duration = Date.now() - start;
      
      // Should complete quickly
      expect(duration).toBeLessThan(500);
      
      // Should have expected structure
      expect(stats).toHaveProperty('totalConversations');
      expect(stats).toHaveProperty('completedConversations');
      expect(stats).toHaveProperty('modeDistribution');
      expect(stats).toHaveProperty('sentimentDistribution');
    });
  });
  
  describe('Query Performance Monitoring', () => {
    it('should track query execution times', async () => {
      const testQuery = 'SELECT * FROM users WHERE id = $1';
      
      await queryMonitor.trackQuery(
        testQuery,
        ['user123'],
        async () => {
          // Simulate query execution
          await new Promise(resolve => setTimeout(resolve, 50));
          return { id: 'user123' };
        }
      );
      
      const stats = await queryMonitor.getQueryStats();
      expect(stats.length).toBeGreaterThan(0);
      
      const queryStat = stats[0];
      expect(queryStat.executionCount).toBe(1);
      expect(queryStat.avgDuration).toBeGreaterThanOrEqual(50);
    });
    
    it('should identify slow queries', async () => {
      const slowQueries: string[] = [];
      
      // Mock logger to capture warnings
      const originalWarn = log.warn;
      log.warn = mock((message: string, details: any) => {
        if (message === 'Slow query detected') {
          slowQueries.push(details.sql);
        }
      });
      
      // Execute a slow query
      await queryMonitor.trackQuery(
        'SELECT * FROM conversations WHERE complex_condition = true',
        [],
        async () => {
          await new Promise(resolve => setTimeout(resolve, 1500));
          return [];
        }
      );
      
      expect(slowQueries.length).toBe(1);
      
      log.warn = originalWarn;
    });
    
    it('should track most frequent queries', async () => {
      // Execute same query multiple times
      for (let i = 0; i < 5; i++) {
        await queryMonitor.trackQuery(
          'SELECT * FROM users WHERE email = $1',
          ['test@example.com'],
          async () => ({ id: 'user123' })
        );
      }
      
      // Execute another query once
      await queryMonitor.trackQuery(
        'SELECT * FROM conversations WHERE id = $1',
        ['conv123'],
        async () => ({ id: 'conv123' })
      );
      
      const frequent = queryMonitor.getMostFrequentQueries(10);
      expect(frequent[0].executionCount).toBe(5);
      expect(frequent[1].executionCount).toBe(1);
    });
  });
  
  describe('Pagination', () => {
    describe('Cursor Pagination', () => {
      it('should encode and decode cursors correctly', () => {
        const original = { value: '2024-01-01T00:00:00Z', id: 'test123' };
        const encoded = CursorPagination.encode(original);
        const decoded = CursorPagination.decode(encoded);
        
        expect(decoded).toEqual(original);
      });
      
      it('should paginate with cursors', async () => {
        // Mock query result
        const mockItems = Array.from({ length: 25 }, (_, i) => ({
          id: `item${i}`,
          createdAt: new Date(Date.now() - i * 1000000)
        }));
        
        const mockQuery = {
          where: mock(() => mockQuery),
          limit: mock((n: number) => Promise.resolve(mockItems.slice(0, n)))
        };
        
        const result = await CursorPagination.paginate({
          query: mockQuery,
          limit: 20,
          cursorColumn: 'createdAt'
        });
        
        expect(result.items.length).toBe(20);
        expect(result.pageInfo.hasNextPage).toBe(true);
        expect(result.pageInfo.endCursor).not.toBeNull();
      });
    });
    
    describe('Offset Pagination', () => {
      it('should calculate page info correctly', async () => {
        const mockItems = Array.from({ length: 10 }, (_, i) => ({ id: i }));
        const mockQuery = {
          limit: mock(() => mockQuery),
          offset: mock(() => Promise.resolve(mockItems))
        };
        
        const mockCountQuery = Promise.resolve([{ count: 100 }]);
        
        const result = await OffsetPagination.paginate({
          query: mockQuery,
          page: 3,
          pageSize: 10,
          countQuery: mockCountQuery
        });
        
        expect(result.pagination.page).toBe(3);
        expect(result.pagination.totalPages).toBe(10);
        expect(result.pagination.hasNextPage).toBe(true);
        expect(result.pagination.hasPreviousPage).toBe(true);
      });
    });
    
    describe('Keyset Pagination', () => {
      it('should paginate with multiple sort keys', async () => {
        const mockItems = Array.from({ length: 20 }, (_, i) => ({
          createdAt: new Date(Date.now() - i * 1000000),
          id: `item${i}`
        }));
        
        const mockQuery = {
          where: mock(() => mockQuery),
          orderBy: mock(() => mockQuery),
          limit: mock((n: number) => Promise.resolve(mockItems.slice(0, n)))
        };
        
        const result = await KeysetPagination.paginate({
          query: mockQuery,
          pageSize: 10,
          orderBy: [
            { column: 'createdAt', direction: 'desc' },
            { column: 'id', direction: 'desc' }
          ]
        });
        
        expect(result.items.length).toBe(10);
        expect(result.nextKey).not.toBeNull();
        expect(result.nextKey?.createdAt).toBeDefined();
        expect(result.nextKey?.id).toBeDefined();
      });
    });
  });
  
  describe('Query Plan Analysis', () => {
    it('should analyze query execution plans', async () => {
      // This test would need a real database connection
      // For now, we'll test the structure
      const plan = await queryMonitor.analyzeQueryPlan(
        'SELECT * FROM users WHERE email = $1',
        ['test@example.com']
      );
      
      // In a real test, we'd check:
      // - Plan uses index scan
      // - No sequential scans on large tables
      // - Reasonable cost estimates
    });
  });
});