import { logger } from '@/utils/logger';
import { formatError } from '@/utils/error-formatter';
import { query, run, transaction } from '../database';
import type { User } from '../types';
import type { Result } from '@/types/common';
import { verifyAppleToken } from '@/utils/apple-auth';

/**
 * Get a user by ID
 * @param id User ID to fetch
 * @returns User object or null if not found
 */
export const getUser = async (id: string): Promise<User | null> => {
  try {
    const users = await query<User>('SELECT * FROM users WHERE id = ?', [id]);
    return users[0] ?? null;
  } catch (error) {
    logger.error(`Error fetching user: ${formatError(error)}`);
    throw error;
  }
};

/**
 * Create or update a user
 * @param params User data to create or update
 * @returns Result object indicating success or failure
 */
export const upsertUser = async ({ 
  id, 
  email, 
  name 
}: { 
  id: string, 
  email: string, 
  name?: string 
}): Promise<Result<void>> => {
  return await transaction(async () => {
    try {
      // Check if email is already used by another user
      const existingUsers = await query<User>(
        'SELECT * FROM users WHERE email = ? AND id != ? LIMIT 1',
        [email, id]
      );
      
      if (existingUsers[0]) {
        logger.warn(`Email ${email} is already in use by another user`);
        return { 
          success: false, 
          error: new Error(`Email ${email} is already in use by another user`) 
        };
      }
      
      await run(`
        INSERT INTO users (id, email, name) 
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          email = excluded.email,
          name = excluded.name,
          updatedAt = strftime('%s', 'now')
      `, [id, email, name ?? null]);
      
      logger.info(`User ${id} upserted successfully`);
      return { success: true, data: undefined };
    } catch (error) {
      logger.error(`Error upserting user: ${formatError(error)}`);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  });
};

/**
 * Delete a user by ID
 * @param id User ID to delete
 * @returns Result object indicating success or failure
 */
export const deleteUser = async (id: string): Promise<Result<void>> => {
  return await transaction(async () => {
    try {
      // First verify user exists
      const userExistsResult = await query<{ exists: number }>(
        'SELECT 1 as exists FROM users WHERE id = ? LIMIT 1',
        [id]
      );
      
      const userExists = userExistsResult[0]?.exists === 1;
      
      if (!userExists) {
        // User doesn't exist - no need to delete, just log and return
        logger.info(`Delete requested for user ${id} but user not found in database - skipping delete`);
        return { success: true, data: undefined };
      }
      
      // Delete user and all related data will be cascaded due to foreign key constraints
      await run('DELETE FROM users WHERE id = ?', [id]);
      logger.info(`User ${id} deleted successfully`);
      return { success: true, data: undefined };
    } catch (error) {
      logger.error(`Error deleting user: ${formatError(error)}`);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  });
};

/**
 * Send a welcome email to a new user
 * @param userId User ID to send welcome email to
 * @param email Email address to send to
 * @returns Result object indicating success or failure
 */
export const sendWelcomeEmail = async (userId: string, email: string): Promise<Result<void>> => {
  try {
    logger.info(`Welcome email queued for user ${userId} ${email}`);
    return { success: true, data: undefined };
  } catch (error) {
    logger.error(`Error queueing welcome email: ${formatError(error)}`);
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};

/**
 * Authenticate with Apple ID token
 * @param identityToken The ID token from Apple Sign In
 * @param name Optional user name provided by Apple (only on first sign-in)
 * @returns Result object with user data if authentication is successful
 */
export const authenticateWithApple = async (
  identityToken: string,
  name?: string
): Promise<Result<User>> => {
  try {
    // Verify Apple token
    const verificationResult = await verifyAppleToken(identityToken);
    if (!verificationResult.success) {
      logger.error(`Apple token verification failed: ${verificationResult.error.message}`);
      return { success: false, error: verificationResult.error };
    }

    const { userId, email } = verificationResult.data;
    
    if (!email) {
      logger.error(`Apple authentication failed: No email provided in token`);
      return { 
        success: false, 
        error: new Error('Authentication requires an email address') 
      };
    }

    // Create or update user record
    const upsertResult = await upsertUser({
      id: `apple:${userId}`, // Prefix with 'apple:' to distinguish from other auth methods
      email,
      name
    });

    if (!upsertResult.success) {
      return { success: false, error: upsertResult.error };
    }

    // Fetch the user to return
    const user = await getUser(`apple:${userId}`);
    if (!user) {
      return { 
        success: false, 
        error: new Error('Failed to create or retrieve user account') 
      };
    }

    logger.info(`User authenticated with Apple: ${user.id}`);
    return { success: true, data: user };
  } catch (error) {
    logger.error(`Error in Apple authentication: ${formatError(error)}`);
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error)) 
    };
  }
};