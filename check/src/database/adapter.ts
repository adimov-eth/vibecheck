import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { drizzleDb, shouldUseDrizzle, users, conversations, audios, subscriptions } from './drizzle';
import { query, queryOne, run } from './index';
import { log } from '../utils/logger';
import type { User, Conversation, Audio, Subscription } from './schema';

/**
 * Database adapter that provides a unified interface for both raw SQL and Drizzle ORM
 * This allows gradual migration from raw SQL to Drizzle with feature flag control
 */
export class DatabaseAdapter {
  // User operations
  static async findUserById(id: string): Promise<User | null> {
    if (shouldUseDrizzle()) {
      const result = await drizzleDb.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async findUserByEmail(email: string): Promise<User | null> {
    if (shouldUseDrizzle()) {
      const result = await drizzleDb.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findUserByUnlockToken(token: string): Promise<User | null> {
    if (shouldUseDrizzle()) {
      const result = await drizzleDb.select().from(users).where(eq(users.unlockToken, token)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE unlockToken = ?', [token]);
  }

  static async createUser(data: {
    id: string;
    email: string;
    name?: string;
    appleId?: string;
    appleRefreshToken?: string;
  }): Promise<void> {
    if (shouldUseDrizzle()) {
      await drizzleDb.insert(users).values({
        ...data,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    await run(
      `INSERT INTO users (id, email, name, appleId, appleRefreshToken, createdAt, updatedAt, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.email, data.name || null, data.appleId || null, data.appleRefreshToken || null, now, now, 1]
    );
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<void> {
    if (shouldUseDrizzle()) {
      await drizzleDb.update(users)
        .set({
          ...updates,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(users.id, id));
      return;
    }

    const fields: string[] = [];
    const values: any[] = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    fields.push('updatedAt = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(id);
    
    await run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  // Conversation operations
  static async findConversationById(id: string): Promise<Conversation | null> {
    if (shouldUseDrizzle()) {
      const result = await drizzleDb.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<Conversation>('SELECT * FROM conversations WHERE id = ?', [id]);
  }

  static async findUserConversations(userId: string, mode?: 'vent' | 'coach'): Promise<Conversation[]> {
    if (shouldUseDrizzle()) {
      let query = drizzleDb.select().from(conversations).where(eq(conversations.userId, userId));
      
      if (mode) {
        query = query.where(and(eq(conversations.userId, userId), eq(conversations.mode, mode)));
      }
      
      return query.orderBy(desc(conversations.createdAt));
    }

    let sqlQuery = 'SELECT * FROM conversations WHERE userId = ?';
    const params: any[] = [userId];
    
    if (mode) {
      sqlQuery += ' AND mode = ?';
      params.push(mode);
    }
    
    sqlQuery += ' ORDER BY createdAt DESC';
    
    return query<Conversation>(sqlQuery, params);
  }

  static async createConversation(data: {
    id: string;
    userId: string;
    mode: 'vent' | 'coach';
    status?: 'processing' | 'completed' | 'failed';
  }): Promise<void> {
    if (shouldUseDrizzle()) {
      await drizzleDb.insert(conversations).values({
        ...data,
        status: data.status || 'processing',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    await run(
      `INSERT INTO conversations (id, userId, mode, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.id, data.userId, data.mode, data.status || 'processing', now, now]
    );
  }

  static async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    if (shouldUseDrizzle()) {
      const updateData = {
        ...updates,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      log.debug('Drizzle update data', { id, updateData });
      await drizzleDb.update(conversations)
        .set(updateData)
        .where(eq(conversations.id, id));
      return;
    }

    const fields: string[] = [];
    const values: any[] = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    fields.push('updatedAt = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(id);
    
    await run(
      `UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  // Note: Session operations removed as sessions table doesn't exist in current schema
  // These would need to be implemented if sessions table is added

  // Subscription operations
  static async findActiveSubscription(userId: string): Promise<Subscription | null> {
    if (shouldUseDrizzle()) {
      const now = new Date();
      const result = await drizzleDb.select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            sql`${subscriptions.expiresDate} IS NULL OR ${subscriptions.expiresDate} > ${now}`
          )
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      return result[0] || null;
    }

    const now = Math.floor(Date.now() / 1000);
    return queryOne<Subscription>(
      `SELECT * FROM subscriptions 
       WHERE userId = ? AND isActive = 1 
       AND (expiresDate IS NULL OR expiresDate > ?)
       ORDER BY createdAt DESC
       LIMIT 1`,
      [userId, now]
    );
  }

  // Audio operations
  static async createAudio(data: {
    id: string;
    conversationId: string;
    userId: string;
    fileUrl: string;
    duration?: number;
    fileSize?: number;
    mimeType?: string;
  }): Promise<void> {
    if (shouldUseDrizzle()) {
      await drizzleDb.insert(audios).values({
        ...data,
        mimeType: data.mimeType || 'audio/mpeg',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    await run(
      `INSERT INTO audios (id, conversationId, userId, fileUrl, duration, fileSize, mimeType, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.conversationId,
        data.userId,
        data.fileUrl,
        data.duration || null,
        data.fileSize || null,
        data.mimeType || 'audio/mpeg',
        'pending',
        Math.floor(Date.now() / 1000)
      ]
    );
  }

  // Transaction support
  static async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (shouldUseDrizzle()) {
      return drizzleDb.transaction(callback);
    }
    
    // For raw SQL, we need to implement transaction support
    // This is a simplified version - in production, you'd want proper transaction management
    try {
      await run('BEGIN');
      const result = await callback(null);
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  }
}

// Export convenience functions that match the existing API
export const adapter = DatabaseAdapter;

// Alias methods for account lockout service
export const getUserByEmail = DatabaseAdapter.findUserByEmail;
export const getUserByUnlockToken = DatabaseAdapter.findUserByUnlockToken;
export const updateUser = DatabaseAdapter.updateUser;