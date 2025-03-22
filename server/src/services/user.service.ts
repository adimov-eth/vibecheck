import { db } from '../database';
import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import { log } from '../utils/logger.utils';

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    return result[0] || null;
  } catch (error) {
    log(`Error getting user by ID: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Create or update a user
 */
export async function createOrUpdateUser(userData: {
  id: string;
  email?: string;
  name?: string;
}) {
  const now = new Date();
  
  try {
    // Check if user exists
    const existingUser = await getUserById(userData.id);
    
    if (existingUser) {
      // Update existing user
      await db
        .update(users)
        .set({
          email: userData.email,
          name: userData.name,
          updatedAt: now
        })
        .where(eq(users.id, userData.id));
      
      return { ...existingUser, ...userData, updatedAt: now };
    } else {
      // Create new user
      const newUserData = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        createdAt: now,
        updatedAt: now
      };
      
      await db
        .insert(users)
        .values(newUserData);
      
      return newUserData;
    }
  } catch (error) {
    log(`Error creating or updating user: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Get all users
 */
export async function getAllUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    log(`Error getting all users: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}