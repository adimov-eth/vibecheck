import { sign } from 'jsonwebtoken';
import { config } from '@/config';
import { createSessionToken } from '@/services/session-service';
import { UserFactory } from '../factories';
import type { User } from '@/types';

export class AuthTestUtils {
  /**
   * Create a valid JWT token for testing
   */
  static createToken(userId: string, expiresIn = '1h'): string {
    return sign(
      { userId, type: 'access' },
      config.jwt.secret,
      { expiresIn }
    );
  }
  
  /**
   * Create an expired token
   */
  static createExpiredToken(userId: string): string {
    return sign(
      { userId, type: 'access' },
      config.jwt.secret,
      { expiresIn: '-1h' }
    );
  }
  
  /**
   * Create a token with invalid signature
   */
  static createInvalidToken(userId: string): string {
    return sign(
      { userId, type: 'access' },
      'wrong-secret',
      { expiresIn: '1h' }
    );
  }
  
  /**
   * Create a user with active session
   */
  static async createAuthenticatedUser(overrides: Partial<User> = {}): Promise<{
    user: User;
    token: string;
    sessionToken: string;
  }> {
    const user = await UserFactory.create(overrides);
    const sessionResult = await createSessionToken(user.id);
    if (!sessionResult.success) {
      throw new Error('Failed to create session token');
    }
    const sessionToken = sessionResult.data;
    const token = this.createToken(user.id);
    
    return { user, token, sessionToken };
  }
  
  /**
   * Create authorization header
   */
  static createAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }
  
  /**
   * Mock Apple sign-in response
   */
  static createMockAppleToken(email: string, sub: string): string {
    const payload = {
      iss: 'https://appleid.apple.com',
      aud: config.apple.bundleId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub,
      email,
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      nonce_supported: true
    };
    
    // In real tests, you'd mock the Apple verification
    return sign(payload, 'mock-apple-secret');
  }
  
  /**
   * Create test request with auth
   */
  static createAuthRequest(userId: string): any {
    return {
      userId,
      headers: this.createAuthHeader(this.createToken(userId)),
      user: { id: userId }
    };
  }
}

// Export convenience functions
export const createAuthenticatedUser = AuthTestUtils.createAuthenticatedUser.bind(AuthTestUtils);
export const createAuthToken = AuthTestUtils.createToken.bind(AuthTestUtils);