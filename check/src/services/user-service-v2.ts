import type { Result } from '@/types/common';
import { verifyAppleToken } from '@/utils/apple-auth';
import { formatError } from '@/utils/error-formatter';
import { log } from '@/utils/logger';
import { adapter } from '../database/adapter';
import { drizzleDb, shouldUseDrizzle, users as usersTable } from '../database/drizzle';
import { eq, and, ne } from 'drizzle-orm';
import type { User } from '../types';
import { randomUUIDv7 } from 'bun';

// Import legacy service for fallback
import * as legacyService from './user-service';

/**
 * User service with Drizzle ORM support
 */
export class UserService {
  /**
   * Get a user by ID
   */
  static async getUser(id: string): Promise<User | null> {
    if (!shouldUseDrizzle()) {
      return legacyService.getUser(id);
    }

    try {
      const user = await adapter.findUserById(id);
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        appAccountToken: user.appAccountToken || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      log.error("Error fetching user", { userId: id, error: formatError(error) });
      throw error;
    }
  }

  /**
   * Create or update a user
   */
  static async upsertUser({
    id,
    email,
    name
  }: {
    id: string,
    email: string,
    name?: string
  }): Promise<Result<void>> {
    if (!shouldUseDrizzle()) {
      return legacyService.upsertUser({ id, email, name });
    }

    return drizzleDb.transaction(async (tx) => {
      try {
        // Check if email is already used by another user
        const existingUsers = await tx
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.email, email), ne(usersTable.id, id)))
          .limit(1);

        if (existingUsers.length > 0) {
          log.warn("Email already in use by another user", { 
            email, 
            existingUserId: existingUsers[0].id, 
            requestedUserId: id 
          });
          return {
            success: false,
            error: new Error(`Email ${email} is already in use by another user`)
          };
        }

        // Check if user exists
        const existingUser = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, id))
          .limit(1);

        if (existingUser.length > 0) {
          // Update existing user
          await tx
            .update(usersTable)
            .set({
              email,
              name: name || existingUser[0].name,
              updatedAt: Math.floor(Date.now() / 1000)
            })
            .where(eq(usersTable.id, id));

          log.info("Updated existing user", { userId: id, email });
        } else {
          // Insert new user
          await tx
            .insert(usersTable)
            .values({
              id,
              email,
              name: name || null,
              createdAt: Math.floor(Date.now() / 1000),
              updatedAt: Math.floor(Date.now() / 1000)
            });

          log.info("Created new user", { userId: id, email });
        }

        return { success: true };
      } catch (error) {
        log.error("Failed to upsert user", { id, email, error: formatError(error) });
        return {
          success: false,
          error: error instanceof Error ? error : new Error('Unknown error')
        };
      }
    });
  }

  /**
   * Find user by email
   */
  static async findUserByEmail(email: string): Promise<User | null> {
    if (!shouldUseDrizzle()) {
      return legacyService.findUserByEmail(email);
    }

    try {
      const user = await adapter.findUserByEmail(email);
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        appAccountToken: user.appAccountToken || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      log.error("Error finding user by email", { email, error: formatError(error) });
      throw error;
    }
  }

  /**
   * Find user by Apple account token
   */
  static async findUserByAppleAccountToken(token: string): Promise<User | null> {
    if (!shouldUseDrizzle()) {
      return legacyService.findUserByAppleAccountToken(token);
    }

    try {
      const users = await drizzleDb
        .select()
        .from(usersTable)
        .where(eq(usersTable.appAccountToken, token))
        .limit(1);

      if (users.length === 0) return null;

      const user = users[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        appAccountToken: user.appAccountToken || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      log.error("Error finding user by Apple account token", { error: formatError(error) });
      throw error;
    }
  }

  /**
   * Create user with Apple Sign In
   */
  static async createUserWithAppleSignIn({
    identityToken,
    user: appleUserData
  }: {
    identityToken: string;
    user?: { email?: string; name?: { firstName?: string; lastName?: string } };
  }): Promise<Result<User>> {
    if (!shouldUseDrizzle()) {
      return legacyService.createUserWithAppleSignIn({ identityToken, user: appleUserData });
    }

    const childLog = log.child({ method: 'createUserWithAppleSignIn' });

    try {
      childLog.info("Starting Apple Sign In user creation");

      // Verify the identity token
      const verificationResult = await verifyAppleToken(identityToken);
      if (!verificationResult.success) {
        childLog.error("Apple token verification failed", { error: verificationResult.error });
        return { success: false, error: verificationResult.error };
      }

      const decodedToken = verificationResult.data;
      childLog.info("Apple token verified successfully", { sub: decodedToken.sub });

      // Extract user info
      const userId = decodedToken.sub;
      const email = decodedToken.email || appleUserData?.email;

      if (!email) {
        childLog.error("No email found in token or user data");
        return { success: false, error: new Error('Email is required for account creation') };
      }

      // Build name from Apple user data
      let name: string | undefined;
      if (appleUserData?.name) {
        const { firstName, lastName } = appleUserData.name;
        name = [firstName, lastName].filter(Boolean).join(' ') || undefined;
      }

      childLog.info("Extracted user info", { userId, email, hasName: !!name });

      // Check if user exists by Apple ID
      const existingUserByAppleId = await this.findUserByAppleAccountToken(userId);
      if (existingUserByAppleId) {
        childLog.info("Found existing user by Apple ID", { userId: existingUserByAppleId.id });
        return { success: true, data: existingUserByAppleId };
      }

      // Check if user exists by email
      const existingUserByEmail = await this.findUserByEmail(email);
      if (existingUserByEmail) {
        childLog.info("Found existing user by email, linking Apple ID", { 
          userId: existingUserByEmail.id, 
          email 
        });
        
        // Update user to link Apple ID
        await drizzleDb
          .update(usersTable)
          .set({
            appAccountToken: userId,
            updatedAt: Math.floor(Date.now() / 1000)
          })
          .where(eq(usersTable.id, existingUserByEmail.id));

        return { 
          success: true, 
          data: { ...existingUserByEmail, appAccountToken: userId } 
        };
      }

      // Create new user
      const newUserId = randomUUIDv7();
      const now = Math.floor(Date.now() / 1000);

      await drizzleDb
        .insert(usersTable)
        .values({
          id: newUserId,
          email,
          name: name || null,
          appAccountToken: userId,
          createdAt: now,
          updatedAt: now
        });

      childLog.info("Created new user with Apple Sign In", { userId: newUserId, email });

      return {
        success: true,
        data: {
          id: newUserId,
          email,
          name,
          appAccountToken: userId,
          createdAt: now,
          updatedAt: now
        }
      };
    } catch (error) {
      childLog.error("Failed to create user with Apple Sign In", { error: formatError(error) });
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Failed to create user')
      };
    }
  }

  /**
   * Delete a user (for testing)
   */
  static async deleteUser(id: string): Promise<void> {
    if (!shouldUseDrizzle()) {
      return legacyService.deleteUser(id);
    }

    try {
      await drizzleDb
        .delete(usersTable)
        .where(eq(usersTable.id, id));
      
      log.info("Deleted user", { userId: id });
    } catch (error) {
      log.error("Error deleting user", { userId: id, error: formatError(error) });
      throw error;
    }
  }
}

// Export functions that match the existing API
export const getUser = UserService.getUser.bind(UserService);
export const upsertUser = UserService.upsertUser.bind(UserService);
export const findUserByEmail = UserService.findUserByEmail.bind(UserService);
export const findUserByAppleAccountToken = UserService.findUserByAppleAccountToken.bind(UserService);
export const createUserWithAppleSignIn = UserService.createUserWithAppleSignIn.bind(UserService);
export const deleteUser = UserService.deleteUser.bind(UserService);