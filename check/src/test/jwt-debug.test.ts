import { describe, test, expect } from 'bun:test';
import { createSessionToken, verifySessionToken } from '@/services/session-service';
import jwt from 'jsonwebtoken';
import { SignJWT, jwtVerify } from 'jose';

describe('JWT Debug Tests', () => {
  test('should create and verify a valid token', async () => {
    const result = await createSessionToken('test-user-123');
    expect(result.success).toBe(true);
    
    if (result.success) {
      const verifyResult = await verifySessionToken(result.data);
      expect(verifyResult.success).toBe(true);
      if (verifyResult.success) {
        expect(verifyResult.data.userId).toBe('test-user-123');
      }
    }
  });

  test('should reject a tampered token', async () => {
    const result = await createSessionToken('test-user-123');
    expect(result.success).toBe(true);
    
    if (result.success) {
      const token = result.data;
      // Tamper with the token
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.userId = 'hacker-user';
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      
      const verifyResult = await verifySessionToken(tamperedToken);
      console.log('Tampered token verify result:', verifyResult);
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.error.message).toContain('signature');
      }
    }
  });

  test('should handle completely invalid tokens', async () => {
    const verifyResult = await verifySessionToken('not-a-jwt-token');
    console.log('Invalid token verify result:', verifyResult);
    expect(verifyResult.success).toBe(false);
  });
});