import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { UserService } from '../user-service';
import { TestDatabase } from '@/test/utils/database';
import { UserFactory, SubscriptionFactory } from '@/test/factories';
import { mockNotificationService } from '@/test/mocks/notification.mock';
import type { User } from '@/types';

describe('UserService', () => {
  let userService: UserService;
  let testDb: TestDatabase;
  
  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
    userService = new UserService();
  });
  
  beforeEach(async () => {
    await testDb.clean();
    mockNotificationService.reset();
  });
  
  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        appleAccountToken: 'apple_token_123'
      };
      
      const user = await userService.create(userData);
      
      expect(user).toMatchObject({
        id: expect.any(String),
        email: 'test@example.com',
        name: 'Test User',
        appleAccountToken: 'apple_token_123'
      });
      
      // Verify saved to database
      const saved = await userService.getById(user.id);
      expect(saved).toEqual(user);
    });
    
    it('should lowercase email addresses', async () => {
      const user = await userService.create({
        email: 'Test@EXAMPLE.com',
        name: 'Test User'
      });
      
      expect(user.email).toBe('test@example.com');
    });
    
    it('should prevent duplicate emails', async () => {
      await userService.create({
        email: 'duplicate@example.com',
        name: 'First User'
      });
      
      await expect(
        userService.create({
          email: 'duplicate@example.com',
          name: 'Second User'
        })
      ).rejects.toThrow('already exists');
    });
    
    it('should generate unique ID if not provided', async () => {
      const user1 = await userService.create({
        email: 'user1@example.com'
      });
      
      const user2 = await userService.create({
        email: 'user2@example.com'
      });
      
      expect(user1.id).toBeTruthy();
      expect(user2.id).toBeTruthy();
      expect(user1.id).not.toBe(user2.id);
    });
  });
  
  describe('updateUser', () => {
    let user: User;
    
    beforeEach(async () => {
      user = await UserFactory.create();
    });
    
    it('should update user fields', async () => {
      const updates = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };
      
      const updated = await userService.update(user.id, updates);
      
      expect(updated.name).toBe('Updated Name');
      expect(updated.email).toBe('updated@example.com');
      expect(updated.id).toBe(user.id); // ID should not change
    });
    
    it('should not allow updating to existing email', async () => {
      const otherUser = await UserFactory.create({
        email: 'existing@example.com'
      });
      
      await expect(
        userService.update(user.id, {
          email: 'existing@example.com'
        })
      ).rejects.toThrow('already in use');
    });
    
    it('should update updatedAt timestamp', async () => {
      const before = user.updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await userService.update(user.id, {
        name: 'New Name'
      });
      
      expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });
  });
  
  describe('getUserByEmail', () => {
    it('should find user by email case-insensitively', async () => {
      const user = await UserFactory.create({
        email: 'test@example.com'
      });
      
      const found1 = await userService.getByEmail('test@example.com');
      const found2 = await userService.getByEmail('TEST@EXAMPLE.COM');
      const found3 = await userService.getByEmail('Test@Example.com');
      
      expect(found1).toEqual(user);
      expect(found2).toEqual(user);
      expect(found3).toEqual(user);
    });
    
    it('should return null for non-existent email', async () => {
      const result = await userService.getByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });
  
  describe('getUserWithSubscription', () => {
    it('should return user with active subscription', async () => {
      const user = await UserFactory.create();
      const subscription = await SubscriptionFactory.createActive(user.id);
      
      const result = await userService.getUserWithSubscription(user.id);
      
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        subscription: {
          id: subscription.id,
          status: 'active',
          plan: subscription.plan
        }
      });
    });
    
    it('should return user without subscription', async () => {
      const user = await UserFactory.create();
      
      const result = await userService.getUserWithSubscription(user.id);
      
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        subscription: null
      });
    });
    
    it('should not return expired subscription', async () => {
      const user = await UserFactory.create();
      await SubscriptionFactory.createExpired(user.id);
      
      const result = await userService.getUserWithSubscription(user.id);
      
      expect(result.subscription).toBeNull();
    });
  });
  
  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      const user = await UserFactory.create();
      
      await userService.delete(user.id);
      
      // Should not be found in normal queries
      const found = await userService.getById(user.id);
      expect(found).toBeNull();
      
      // But should exist with deleted flag
      const deleted = await userService.getById(user.id, {
        includeDeleted: true
      });
      expect(deleted).toBeTruthy();
      expect(deleted.deletedAt).toBeTruthy();
    });
    
    it('should anonymize user data on deletion', async () => {
      const user = await UserFactory.create({
        email: 'real@example.com',
        name: 'Real Name'
      });
      
      await userService.delete(user.id, { anonymize: true });
      
      const deleted = await userService.getById(user.id, {
        includeDeleted: true
      });
      
      expect(deleted.email).toMatch(/deleted_\w+@deleted\.com/);
      expect(deleted.name).toBe('[Deleted User]');
      expect(deleted.appleAccountToken).toBeNull();
    });
  });
  
  describe('authenticateWithApple', () => {
    it('should create new user on first sign in', async () => {
      const appleData = {
        sub: 'apple_sub_123',
        email: 'newuser@example.com',
        name: 'New User'
      };
      
      const { user, isNewUser } = await userService.authenticateWithApple(appleData);
      
      expect(isNewUser).toBe(true);
      expect(user).toMatchObject({
        email: 'newuser@example.com',
        name: 'New User',
        appleAccountToken: 'apple_sub_123'
      });
    });
    
    it('should return existing user on subsequent sign ins', async () => {
      const existingUser = await UserFactory.create({
        appleAccountToken: 'apple_sub_123',
        email: 'existing@example.com'
      });
      
      const { user, isNewUser } = await userService.authenticateWithApple({
        sub: 'apple_sub_123',
        email: 'existing@example.com'
      });
      
      expect(isNewUser).toBe(false);
      expect(user.id).toBe(existingUser.id);
    });
    
    it('should update email if changed in Apple', async () => {
      const existingUser = await UserFactory.create({
        appleAccountToken: 'apple_sub_123',
        email: 'old@example.com'
      });
      
      const { user } = await userService.authenticateWithApple({
        sub: 'apple_sub_123',
        email: 'new@example.com'
      });
      
      expect(user.email).toBe('new@example.com');
    });
  });
  
  describe('getUserStats', () => {
    it('should aggregate user statistics', async () => {
      const user = await UserFactory.create();
      
      // Create related data
      const { ConversationFactory } = await import('@/test/factories');
      await ConversationFactory.createMany(5, {
        userId: user.id,
        status: 'completed'
      });
      await ConversationFactory.create({
        userId: user.id,
        status: 'failed'
      });
      
      await SubscriptionFactory.createActive(user.id);
      
      const stats = await userService.getUserStats(user.id);
      
      expect(stats).toEqual({
        userId: user.id,
        totalConversations: 6,
        completedConversations: 5,
        hasActiveSubscription: true,
        accountAge: expect.any(Number),
        lastActiveDate: expect.any(Date)
      });
    });
  });
});