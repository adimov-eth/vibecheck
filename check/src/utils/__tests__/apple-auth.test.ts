import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { verifyAppleToken } from '../apple-auth';
import * as appleJwsVerifier from '../../services/apple-jws-verifier';
import * as appleAuthCache from '../apple-auth-cache';

describe('Apple Auth Verification', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mock.restore();
  });

  describe('verifyAppleToken', () => {
    test('should verify valid Apple token', async () => {
      // Mock cache miss
      const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
      getCachedMock.mockResolvedValueOnce(null);
      
      // Mock cache set
      const cacheMock = spyOn(appleAuthCache, 'cacheAppleAuthResult');
      cacheMock.mockResolvedValueOnce(undefined);
      
      // Mock successful verification
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      verifyMock.mockResolvedValueOnce({
        isValid: true,
        payload: {
          sub: 'apple123',
          email: 'user@example.com',
          iss: 'https://appleid.apple.com',
          aud: 'com.test.app',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        }
      });
      
      const result = await verifyAppleToken('mock-token');
      
      expect(result).toEqual({
        success: true,
        data: {
          userId: 'apple123',
          email: 'user@example.com'
        }
      });
      
      // Verify caching occurred
      expect(cacheMock).toHaveBeenCalledWith('mock-token', expect.objectContaining({
        success: true,
        data: {
          userId: 'apple123',
          email: 'user@example.com'
        }
      }));
    });
    
    test('should return cached result if available', async () => {
      // Mock cache hit
      const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
      getCachedMock.mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'cached-user',
          email: 'cached@example.com'
        }
      });
      
      // Verification should not be called
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      
      const result = await verifyAppleToken('cached-token');
      
      expect(result).toEqual({
        success: true,
        data: {
          userId: 'cached-user',
          email: 'cached@example.com'
        }
      });
      
      // Verify that actual verification was not called
      expect(verifyMock).not.toHaveBeenCalled();
    });
    
    test('should handle verification failure', async () => {
      // Mock cache miss
      const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
      getCachedMock.mockResolvedValueOnce(null);
      
      // Mock cache set
      const cacheMock = spyOn(appleAuthCache, 'cacheAppleAuthResult');
      cacheMock.mockResolvedValueOnce(undefined);
      
      // Mock failed verification
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      verifyMock.mockResolvedValueOnce({
        isValid: false,
        error: 'Invalid token signature'
      });
      
      const result = await verifyAppleToken('invalid-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid token signature');
      
      // Verify failure was cached
      expect(cacheMock).toHaveBeenCalledWith('invalid-token', expect.objectContaining({
        success: false
      }));
    });
    
    test('should handle missing user ID in token', async () => {
      // Mock cache miss
      const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
      getCachedMock.mockResolvedValueOnce(null);
      
      // Mock verification with missing sub
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      verifyMock.mockResolvedValueOnce({
        isValid: true,
        payload: {
          email: 'user@example.com',
          iss: 'https://appleid.apple.com',
          aud: 'com.test.app',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
          // sub is missing
        }
      });
      
      const result = await verifyAppleToken('token-without-sub');
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Apple token verification failed');
    });
    
    test('should handle exceptions during verification', async () => {
      // Mock cache miss
      const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
      getCachedMock.mockResolvedValueOnce(null);
      
      // Mock verification throwing error
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      verifyMock.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await verifyAppleToken('error-token');
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Network error');
    });
  });
});

describe('Apple Auth Security', () => {
  test('should handle errors appropriately', async () => {
    // Mock cache miss
    const getCachedMock = spyOn(appleAuthCache, 'getCachedAppleAuth');
    getCachedMock.mockResolvedValueOnce(null);
    
    // Mock various error scenarios
    const errorScenarios = [
      { error: new Error('Database connection failed'), expectedMessage: 'Database connection failed' },
      { error: new Error('Invalid token format'), expectedMessage: 'Invalid token format' },
      { error: 'String error', expectedMessage: 'String error' }
    ];
    
    for (const { error, expectedMessage } of errorScenarios) {
      const verifyMock = spyOn(appleJwsVerifier, 'verifyAppleIdentityTokenJws');
      verifyMock.mockRejectedValueOnce(error);
      
      const result = await verifyAppleToken('error-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe(expectedMessage);
      
      // Reset mocks for next iteration
      getCachedMock.mockResolvedValueOnce(null);
    }
  });
});