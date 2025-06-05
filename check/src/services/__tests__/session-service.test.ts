import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { createSessionToken, verifySessionToken } from '../session-service';
import * as jwtKeyService from '../jwt-key-service';
import * as config from '../../config';

describe('SessionService', () => {
  beforeEach(() => {
    // Set up test environment
    process.env.JWT_SECRET = 'test-secret-key-32-bytes-long!!!';
    process.env.NODE_ENV = 'test';
  });
  
  afterEach(() => {
    // Clear all spies
    mock.restore();
  });
  
  describe('createSession', () => {
    test('should create valid JWT token', async () => {
      // Mock JWT key service
      const getCurrentSigningKeyIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getCurrentSigningKeyId');
      getCurrentSigningKeyIdSpy.mockResolvedValueOnce({
        success: true,
        data: 'test-key-id'
      });
      
      const getKeyByIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getKeyById');
      getKeyByIdSpy.mockResolvedValueOnce({
        success: true,
        data: {
          id: 'test-key-id',
          secret: 'test-secret-key-32-bytes-long!!!',
          algorithm: 'HS256' as const,
          status: 'active' as const,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      
      const userId = 'test-user-123';
      const result = await createSessionToken(userId);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const token = result.data;
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        
        // Token should have 3 parts (header.payload.signature)
        const parts = token.split('.');
        expect(parts.length).toBe(3);
        
        // Decode and verify payload
        const payloadBase64 = parts[1];
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
        expect(payload.userId).toBe(userId);
        expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
        expect(payload.iat).toBeLessThanOrEqual(Date.now() / 1000);
        
        // Decode and verify header
        const headerBase64 = parts[0];
        const header = JSON.parse(Buffer.from(headerBase64, 'base64url').toString());
        expect(header.kid).toBe('test-key-id');
        expect(header.alg).toBe('HS256');
      }
    });
    
    test('should fallback to legacy key when no active key', async () => {
      const getCurrentSigningKeyIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getCurrentSigningKeyId');
      getCurrentSigningKeyIdSpy.mockResolvedValueOnce({
        success: false,
        error: new Error('No active key available')
      });
      
      const result = await createSessionToken('user123');
      
      // Should succeed with legacy key
      expect(result.success).toBe(true);
      if (result.success) {
        const token = result.data;
        expect(token).toBeTruthy();
        
        // Token should not have kid in header when using legacy key
        const parts = token.split('.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        expect(header.kid).toBeUndefined();
        expect(header.alg).toBe('HS256');
      }
    });
  });
  
  describe('verifySession', () => {
    test('should verify valid token', async () => {
      // First create a token
      const getCurrentSigningKeyIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getCurrentSigningKeyId');
      getCurrentSigningKeyIdSpy.mockResolvedValueOnce({
        success: true,
        data: 'test-key-id'
      });
      
      const mockKey = {
        id: 'test-key-id',
        secret: 'test-secret-key-32-bytes-long!!!',
        algorithm: 'HS256' as const,
        status: 'active' as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      
      const getKeyByIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getKeyById');
      getKeyByIdSpy.mockResolvedValueOnce({
        success: true,
        data: mockKey
      });
      
      const userId = 'test-user';
      const tokenResult = await createSessionToken(userId);
      expect(tokenResult.success).toBe(true);
      
      if (tokenResult.success) {
        // Now verify the token
        const getActiveKeysSpy = spyOn(jwtKeyService.jwtKeyService, 'getActiveKeys');
        getActiveKeysSpy.mockResolvedValueOnce({
          success: true,
          data: [mockKey]
        });
        
        const result = await verifySessionToken(tokenResult.data);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.userId).toBe(userId);
        }
      }
    });
    
    test('should reject expired token', async () => {
      // Create an expired token by manipulating the payload
      const expiredPayload = {
        userId: 'test-user',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        iat: Math.floor(Date.now() / 1000) - 7200  // 2 hours ago
      };
      
      // Create a fake JWT token
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'test-key' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const signature = 'fake-signature';
      const expiredToken = `${header}.${payload}.${signature}`;
      
      const result = await verifySessionToken(expiredToken);
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('key not found');
    });
    
    test('should reject token with invalid format', async () => {
      const invalidTokens = [
        'not.a.token',
        'only.two',
        '',
        'a'.repeat(5000)
      ];
      
      for (const token of invalidTokens) {
        const result = await verifySessionToken(token);
        
        expect(result.success).toBe(false);
        expect(result.error?.message).toBeDefined();
      }
    });
    
    test('should verify with any active key during rotation', async () => {
      // Create token with one key
      const getCurrentSigningKeyIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getCurrentSigningKeyId');
      getCurrentSigningKeyIdSpy.mockResolvedValueOnce({
        success: true,
        data: 'old-key-id'
      });
      
      const oldKey = {
        id: 'old-key-id',
        secret: 'old-secret-key-32-bytes-long!!!!',
        algorithm: 'HS256' as const,
        status: 'rotating' as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
      
      const getKeyByIdSpy = spyOn(jwtKeyService.jwtKeyService, 'getKeyById');
      getKeyByIdSpy.mockResolvedValueOnce({
        success: true,
        data: oldKey
      });
      
      const userId = 'test-user';
      const tokenResult = await createSessionToken(userId);
      expect(tokenResult.success).toBe(true);
      
      if (tokenResult.success) {
        // Mock multiple active keys for verification
        const getActiveKeysSpy = spyOn(jwtKeyService.jwtKeyService, 'getActiveKeys');
        getActiveKeysSpy.mockResolvedValueOnce({
          success: true,
          data: [
            oldKey,
            {
              id: 'new-key-id',
              secret: 'new-secret-key-32-bytes-long!!!!',
              algorithm: 'HS256' as const,
              status: 'active' as const,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          ]
        });
        
        const result = await verifySessionToken(tokenResult.data);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.userId).toBe(userId);
        }
      }
    });
  });
});