import { users } from '../database/schema';
import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../database/types';
import { log } from '../utils/logger.utils';

interface UserData {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Get user by ID
 */
export async function getUserById(id: string, db: DrizzleDB) {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
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
export async function createOrUpdateUser(userData: UserData, db: DrizzleDB) {
  const { id, email, name } = userData;
  
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
}

/**
 * Get all users
 */
export async function getAllUsers(db: DrizzleDB) {
  try {
    return await db.select().from(users);
  } catch (error) {
    log(`Error getting all users: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}