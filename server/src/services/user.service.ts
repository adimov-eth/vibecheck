import { eq } from 'drizzle-orm';
import { PooledDatabase } from '../database'; // Use PooledDatabase instead of DrizzleDB
import { users } from '../database/schema';
import { log } from '../utils/logger.utils';

interface UserData {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Get user by ID
 */
export async function getUserById(id: string, db: PooledDatabase) {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    
    return result[0] || null;
  } catch (error) {
    log(`Error getting user by ID ${id}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Create or update a user
 */
export async function createOrUpdateUser(userData: UserData, db: PooledDatabase) {
  const { id, email, name } = userData;
  
  try {
    const existingUser = await getUserById(id, db);
    
    if (existingUser) {
      return db
        .update(users)
        .set({
          email: email || existingUser.email,
          name: name || existingUser.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning()
        .then(r => r[0]);
    }
    
    return db
      .insert(users)
      .values({
        id,
        email: email || null,
        name: name || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .then(r => r[0]);
  } catch (error) {
    log(`Error creating/updating user ${id}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Delete a user (soft delete or cascade handled by foreign keys)
 */
export async function deleteUser(id: string, db: PooledDatabase) {
  try {
    const existingUser = await getUserById(id, db);
    if (!existingUser) {
      log(`User ${id} not found for deletion`, 'warn');
      return null;
    }

    // Note: Foreign keys with ON DELETE CASCADE will handle related data
    const result = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    
    return result[0] || null;
  } catch (error) {
    log(`Error deleting user ${id}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Get all users
 */
export async function getAllUsers(db: PooledDatabase) {
  try {
    return await db.select().from(users);
  } catch (error) {
    log(`Error getting all users: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}