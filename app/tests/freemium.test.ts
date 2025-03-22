/**
 * Freemium Logic Tests
 * 
 * These tests verify that our freemium logic and paywall behavior
 * work as expected in various scenarios.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getUserUsageStats, canCreateConversation } from '../../server/src/services/usage.service';
import { hasActiveSubscription } from '../../server/src/services/subscription.service';

// Mock the database operations
vi.mock('../../server/src/database', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue([{ count: 0 }]),
  }
}));

// Mock the subscription service
vi.mock('../../server/src/services/subscription.service', () => ({
  hasActiveSubscription: vi.fn(),
}));

// Mock logger to avoid console noise in tests
vi.mock('../../server/src/utils/logger.utils', () => ({
  log: vi.fn(),
}));

describe('Freemium Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canCreateConversation', () => {
    test('should allow creation for subscribed users', async () => {
      // Mock user has subscription
      hasActiveSubscription.mockResolvedValue({
        isActive: true,
        type: 'monthly',
        expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subscriptionId: 1
      });

      const result = await canCreateConversation('user123');
      
      expect(result.canCreate).toBe(true);
      expect(result.isSubscribed).toBe(true);
      expect(result.limit).toBe(-1); // Unlimited
    });

    test('should allow creation for free users under limit', async () => {
      // Mock user doesn't have subscription
      hasActiveSubscription.mockResolvedValue({
        isActive: false,
        type: null,
        expiresDate: null,
        subscriptionId: null
      });
      
      // Mock user has used 5 conversations this month
      vi.mocked(db.then).mockResolvedValueOnce([{ count: 5 }]);

      const result = await canCreateConversation('user123');
      
      expect(result.canCreate).toBe(true);
      expect(result.isSubscribed).toBe(false);
      expect(result.currentUsage).toBe(5);
      expect(result.limit).toBe(10);
    });

    test('should deny creation for free users at limit', async () => {
      // Mock user doesn't have subscription
      hasActiveSubscription.mockResolvedValue({
        isActive: false,
        type: null,
        expiresDate: null,
        subscriptionId: null
      });
      
      // Mock user has used 10 conversations this month (at limit)
      vi.mocked(db.then).mockResolvedValueOnce([{ count: 10 }]);

      const result = await canCreateConversation('user123');
      
      expect(result.canCreate).toBe(false);
      expect(result.isSubscribed).toBe(false);
      expect(result.currentUsage).toBe(10);
      expect(result.limit).toBe(10);
      expect(result.reason).toBe('Monthly conversation limit reached');
    });
  });

  describe('getUserUsageStats', () => {
    test('should return unlimited stats for subscribed users', async () => {
      // Mock user has subscription
      hasActiveSubscription.mockResolvedValue({
        isActive: true,
        type: 'yearly',
        expiresDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        subscriptionId: 2
      });

      const result = await getUserUsageStats('user123');
      
      expect(result.isSubscribed).toBe(true);
      expect(result.limit).toBe(-1); // Unlimited
      expect(result.remainingConversations).toBe(-1); // Unlimited
    });

    test('should return correct remaining conversations for free users', async () => {
      // Mock user doesn't have subscription
      hasActiveSubscription.mockResolvedValue({
        isActive: false,
        type: null,
        expiresDate: null,
        subscriptionId: null
      });
      
      // Mock user has used 7 conversations this month
      vi.mocked(db.then).mockResolvedValueOnce([{ count: 7 }]);

      const result = await getUserUsageStats('user123');
      
      expect(result.isSubscribed).toBe(false);
      expect(result.currentUsage).toBe(7);
      expect(result.limit).toBe(10);
      expect(result.remainingConversations).toBe(3);
      
      // Ensure reset date is first of next month
      const now = new Date();
      const nextMonth = now.getUTCMonth() + 1;
      const year = nextMonth === 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      const month = nextMonth === 12 ? 0 : nextMonth;
      const expectedResetDate = new Date(Date.UTC(year, month, 1));
      
      expect(result.resetDate.getUTCFullYear()).toBe(expectedResetDate.getUTCFullYear());
      expect(result.resetDate.getUTCMonth()).toBe(expectedResetDate.getUTCMonth());
      expect(result.resetDate.getUTCDate()).toBe(expectedResetDate.getUTCDate());
    });
  });
}); 