import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/utils/async-handler';
import { formatError } from '@/utils/error-formatter';
import { log } from '@/utils/logger';
import { jwtKeyService } from '@/services/jwt-key-service';
import { AuthenticationError, ValidationError } from '@/middleware/error';

// Validation schemas
const revokeKeySchema = z.object({
  keyId: z.string().min(1, 'Key ID is required')
});

const rotateKeysSchema = z.object({
  force: z.boolean().optional().default(false)
});

// Middleware to check admin authentication
const requireAdmin = (req: Request, res: Response, next: Function) => {
  // Check for admin token or special header
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_API_TOKEN;

  if (!expectedToken || adminToken !== expectedToken) {
    log.warn('Unauthorized admin access attempt', { 
      ip: req.ip,
      path: req.path
    });
    throw new AuthenticationError('Unauthorized - admin access required');
  }

  next();
};

/**
 * GET /admin/jwt/keys
 * Lists all JWT keys
 */
export const listKeys = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req, res, () => {});

  const keysResult = await jwtKeyService.getAllKeys();
  
  if (!keysResult.success) {
    log.error('Failed to list JWT keys', { error: formatError(keysResult.error) });
    throw new Error('Failed to list JWT keys');
  }

  // Sanitize keys - don't send actual secrets
  const sanitizedKeys = keysResult.data.map(key => ({
    id: key.id,
    algorithm: key.algorithm,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    status: key.status,
    // Add a truncated version of the secret for verification
    secretPreview: `${key.secret.substring(0, 8)}...${key.secret.substring(key.secret.length - 4)}`
  }));

  // Get current signing key
  const signingKeyResult = await jwtKeyService.getCurrentSigningKeyId();
  const currentSigningKeyId = signingKeyResult.success ? signingKeyResult.data : null;

  res.json({
    success: true,
    data: {
      keys: sanitizedKeys,
      currentSigningKeyId,
      totalKeys: sanitizedKeys.length,
      activeKeys: sanitizedKeys.filter(k => k.status === 'active' || k.status === 'rotating').length
    }
  });
});

/**
 * POST /admin/jwt/keys/revoke
 * Revokes a specific JWT key
 */
export const revokeKey = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req, res, () => {});

  const validation = revokeKeySchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError(validation.error.format());
  }

  const { keyId } = validation.data;

  // Check if trying to revoke the current signing key
  const signingKeyResult = await jwtKeyService.getCurrentSigningKeyId();
  if (signingKeyResult.success && signingKeyResult.data === keyId) {
    throw new ValidationError({ 
      keyId: { _errors: ['Cannot revoke the current signing key. Rotate keys first.'] } 
    });
  }

  const result = await jwtKeyService.revokeKey(keyId);
  
  if (!result.success) {
    log.error('Failed to revoke JWT key', { 
      keyId,
      error: formatError(result.error) 
    });
    throw new Error('Failed to revoke JWT key');
  }

  log.info('JWT key revoked by admin', { 
    keyId,
    adminIp: req.ip
  });

  res.json({
    success: true,
    message: 'JWT key revoked successfully',
    data: { keyId }
  });
});

/**
 * POST /admin/jwt/keys/rotate
 * Manually triggers JWT key rotation
 */
export const rotateKeys = asyncHandler(async (req: Request, res: Response) => {
  requireAdmin(req, res, () => {});

  const validation = rotateKeysSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ValidationError(validation.error.format());
  }

  const { force } = validation.data;

  // If not forcing, use the standard check and rotate
  if (!force) {
    const checkResult = await jwtKeyService.checkAndRotateKeys();
    
    if (!checkResult.success) {
      log.error('Failed to check and rotate JWT keys', { 
        error: formatError(checkResult.error) 
      });
      throw new Error('Failed to check and rotate JWT keys');
    }

    // Get the current key to return info
    const signingKeyResult = await jwtKeyService.getCurrentSigningKeyId();
    if (signingKeyResult.success && signingKeyResult.data) {
      const keyResult = await jwtKeyService.getKeyById(signingKeyResult.data);
      if (keyResult.success && keyResult.data) {
        res.json({
          success: true,
          message: 'Key rotation check completed',
          data: {
            rotated: false,
            currentKeyId: keyResult.data.id,
            currentKeyAge: Math.floor((Date.now() - keyResult.data.createdAt.getTime()) / (24 * 60 * 60 * 1000))
          }
        });
        return;
      }
    }
  } else {
    // Force rotation
    const result = await jwtKeyService.rotateKeys();
    
    if (!result.success) {
      log.error('Failed to force rotate JWT keys', { 
        error: formatError(result.error) 
      });
      throw new Error('Failed to force rotate JWT keys');
    }

    log.info('JWT keys force rotated by admin', { 
      newKeyId: result.data.id,
      adminIp: req.ip
    });

    res.json({
      success: true,
      message: 'JWT keys rotated successfully',
      data: {
        rotated: true,
        newKeyId: result.data.id,
        expiresAt: result.data.expiresAt
      }
    });
    return;
  }

  res.json({
    success: true,
    message: 'Key rotation check completed',
    data: { rotated: false }
  });
});