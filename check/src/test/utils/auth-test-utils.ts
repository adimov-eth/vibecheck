import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { mock } from 'bun:test';

// Helper to encode to base64url
const base64url = (data: string): string => {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

// Create a properly formatted Apple JWT token for testing
export const createMockAppleToken = (payload: any = {}): string => {
  const header = {
    alg: 'RS256',
    kid: payload.kid || 'test-key-id',
    typ: 'JWT'
  };
  
  const claims = {
    iss: 'https://appleid.apple.com',
    aud: process.env.APPLE_BUNDLE_ID || 'com.test.app',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    sub: 'test-user-id',
    c_hash: 'test-hash',
    email: 'test@example.com',
    email_verified: 'true',
    auth_time: Math.floor(Date.now() / 1000),
    nonce_supported: true,
    ...payload
  };
  
  // Create the token without actual RSA signature (for testing)
  return [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(claims)),
    'mock-signature'
  ].join('.');
};

// Mock Apple token verification
export const mockAppleTokenVerification = (expectedPayload: any) => {
  return mock(async (token: string) => {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (!token || typeof token !== 'string') {
      return {
        success: false,
        error: new Error('Invalid token format')
      };
    }
    
    return {
      success: true,
      data: {
        userId: expectedPayload.sub || 'test-user',
        email: expectedPayload.email || 'test@example.com'
      }
    };
  });
};

// Create a test JWT token with custom claims
export const createTestJWT = (payload: any, options: any = {}): string => {
  const defaultPayload = {
    userId: 'test-user-123',
    sessionId: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };
  
  const defaultOptions = {
    algorithm: 'HS256',
    header: {
      kid: 'test-key-id'
    }
  };
  
  return jwt.sign(
    { ...defaultPayload, ...payload },
    options.secret || 'test-secret-key',
    { ...defaultOptions, ...options }
  );
};

// Create an expired JWT token
export const createExpiredJWT = (userId: string = 'test-user'): string => {
  return createTestJWT(
    {
      userId,
      exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    },
    { secret: 'test-secret-key' }
  );
};

// Create authenticated request mock
export const createAuthenticatedRequest = (overrides: any = {}) => {
  const token = createTestJWT({ userId: overrides.userId || 'test-user-123' });
  
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...overrides.headers
    },
    userId: overrides.userId || 'test-user-123',
    sessionId: overrides.sessionId || 'test-session-id',
    ip: overrides.ip || '127.0.0.1',
    method: overrides.method || 'GET',
    path: overrides.path || '/test',
    params: overrides.params || {},
    query: overrides.query || {},
    body: overrides.body || {},
    ...overrides
  };
};

// Mock session service for testing
export const createMockSessionService = () => {
  return {
    createSessionToken: mock(async (userId: string) => {
      return createTestJWT({ userId });
    }),
    
    verifySessionToken: mock(async (token: string) => {
      try {
        const decoded = jwt.decode(token) as any;
        if (!decoded) {
          return {
            success: false,
            error: new Error('Invalid token')
          };
        }
        
        // Check expiration
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
          return {
            success: false,
            error: new Error('Token expired')
          };
        }
        
        return {
          success: true,
          data: {
            userId: decoded.userId,
            sessionId: decoded.sessionId || decoded.jti
          }
        };
      } catch (error) {
        return {
          success: false,
          error: new Error('Invalid token')
        };
      }
    }),
    
    revokeSession: mock(async (sessionId: string) => {
      return { success: true };
    })
  };
};

// Mock user service for testing
export const createMockUserService = () => {
  const users = new Map();
  
  return {
    authenticateWithApple: mock(async (token: string, email?: string) => {
      // Simulate Apple token verification
      const parts = token.split('.');
      if (parts.length !== 3) {
        return {
          success: false,
          error: new Error('Invalid token format')
        };
      }
      
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const userId = `apple:${payload.sub}`;
        
        // Check for duplicate email
        if (email) {
          for (const [id, user] of users.entries()) {
            if (user.email === email && id !== userId) {
              return {
                success: false,
                error: new Error('Email already associated with another account'),
                code: 'EMAIL_ALREADY_EXISTS'
              };
            }
          }
        }
        
        const existingUser = users.get(userId);
        const user = existingUser || {
          id: userId,
          email: email || payload.email || `${payload.sub}@example.com`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        if (!existingUser) {
          users.set(userId, user);
        }
        
        return {
          success: true,
          data: {
            user,
            token: createTestJWT({ userId }),
            isNewUser: !existingUser
          }
        };
      } catch (error) {
        return {
          success: false,
          error: new Error('Invalid token')
        };
      }
    }),
    
    getUser: mock(async (userId: string) => {
      const user = users.get(userId);
      return user || null;
    }),
    
    _reset: () => {
      users.clear();
    }
  };
};

// Security test helpers
export const generateSecureRandomString = (length: number = 32): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

export const simulateTimingAttack = async (
  fn: (input: string) => Promise<any>,
  validInput: string,
  invalidInput: string,
  iterations: number = 100
): Promise<{ avgValidTime: number; avgInvalidTime: number; difference: number }> => {
  const validTimes: number[] = [];
  const invalidTimes: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    // Test valid input
    const validStart = performance.now();
    await fn(validInput);
    validTimes.push(performance.now() - validStart);
    
    // Test invalid input
    const invalidStart = performance.now();
    await fn(invalidInput);
    invalidTimes.push(performance.now() - invalidStart);
  }
  
  const avgValidTime = validTimes.reduce((a, b) => a + b) / validTimes.length;
  const avgInvalidTime = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length;
  const difference = Math.abs(avgValidTime - avgInvalidTime);
  
  return { avgValidTime, avgInvalidTime, difference };
};

// Rate limiting test helpers
export const simulateRapidRequests = async (
  fn: () => Promise<any>,
  count: number,
  delayMs: number = 0
): Promise<any[]> => {
  const results = [];
  
  for (let i = 0; i < count; i++) {
    results.push(await fn());
    if (delayMs > 0 && i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
};

// Test data generators
export const generateTestUser = (overrides: any = {}) => {
  const id = overrides.id || `apple:${generateSecureRandomString(16)}`;
  return {
    id,
    email: overrides.email || `test-${Date.now()}@example.com`,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    ...overrides
  };
};

export const generateTestSession = (overrides: any = {}) => {
  return {
    id: overrides.id || generateSecureRandomString(32),
    userId: overrides.userId || 'test-user-123',
    createdAt: overrides.createdAt || new Date(),
    expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides
  };
};

// Error matching helpers
export const expectAuthError = (error: any, expectedMessage?: string) => {
  expect(error).toBeDefined();
  expect(error.name).toMatch(/Auth(entication|orization)Error/);
  if (expectedMessage) {
    expect(error.message).toContain(expectedMessage);
  }
};

export const expectSecurityError = (error: any, expectedCode?: string) => {
  expect(error).toBeDefined();
  expect(error.name).toBe('SecurityError');
  if (expectedCode) {
    expect(error.code).toBe(expectedCode);
  }
};