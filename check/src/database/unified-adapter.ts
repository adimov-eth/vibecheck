import { eq, and, desc, sql, inArray, gte, lte } from 'drizzle-orm';
import { drizzleDb as sqliteDb, shouldUseDrizzle, users as sqliteUsers, conversations as sqliteConversations, audios as sqliteAudios, subscriptions as sqliteSubscriptions } from './drizzle';
import { pgDb, users as pgUsers, conversations as pgConversations, audios as pgAudios, subscriptions as pgSubscriptions, sessions as pgSessions, usageRecords as pgUsageRecords } from './drizzle.postgres';
import { query, queryOne, run } from './index';
import { log } from '../utils/logger';
import type { User, Conversation, Audio, Subscription } from './schema';
import type { User as PgUser, Conversation as PgConversation, Audio as PgAudio, Subscription as PgSubscription, Session as PgSession } from './schema.postgres';

// Determine which database to use
const usePostgres = () => process.env.DATABASE_TYPE === 'postgres';

// Type conversion utilities
function convertTimestampToUnix(timestamp: Date | null | undefined): number | null {
  if (!timestamp) return null;
  return Math.floor(timestamp.getTime() / 1000);
}

function convertUnixToTimestamp(unix: number | null | undefined): Date | null {
  if (!unix) return null;
  return new Date(unix * 1000);
}

// Convert PostgreSQL types to SQLite-compatible types
function pgUserToSqliteUser(pgUser: PgUser): User {
  return {
    ...pgUser,
    accountLocked: pgUser.accountLocked ? 1 : 0,
    accountLockedAt: convertTimestampToUnix(pgUser.accountLockedAt),
    unlockTokenGeneratedAt: convertTimestampToUnix(pgUser.unlockTokenGeneratedAt),
    createdAt: convertTimestampToUnix(pgUser.createdAt)!,
    updatedAt: convertTimestampToUnix(pgUser.updatedAt)!,
  };
}

function pgConversationToSqliteConversation(pgConv: PgConversation): Conversation {
  return {
    ...pgConv,
    completedAt: undefined, // Not in SQLite schema
    analysis: pgConv.analysis || undefined,
    createdAt: convertTimestampToUnix(pgConv.createdAt)!,
    updatedAt: convertTimestampToUnix(pgConv.updatedAt)!,
  };
}

function pgAudioToSqliteAudio(pgAudio: PgAudio): Audio {
  return {
    ...pgAudio,
    duration: undefined, // Not in SQLite schema
    sizeBytes: undefined, // Not in SQLite schema
    createdAt: convertTimestampToUnix(pgAudio.createdAt)!,
    updatedAt: convertTimestampToUnix(pgAudio.updatedAt)!,
  };
}

function pgSubscriptionToSqliteSubscription(pgSub: PgSubscription): Subscription {
  return {
    ...pgSub,
    isActive: pgSub.isActive ? 1 : 0,
    expiresDate: convertTimestampToUnix(pgSub.expiresDate),
    lastRenewalDate: convertTimestampToUnix(pgSub.lastRenewalDate),
    autoRenewStatus: pgSub.autoRenewStatus ? 1 : 0,
    gracePeriodExpiresDate: convertTimestampToUnix(pgSub.gracePeriodExpiresDate),
    cancellationDate: convertTimestampToUnix(pgSub.cancellationDate),
    appleReceiptData: undefined, // Not in SQLite schema
    createdAt: convertTimestampToUnix(pgSub.createdAt)!,
    updatedAt: convertTimestampToUnix(pgSub.updatedAt)!,
  };
}

/**
 * Unified database adapter that supports both SQLite and PostgreSQL
 */
export class UnifiedDatabaseAdapter {
  // User operations
  static async findUserById(id: string): Promise<User | null> {
    if (usePostgres()) {
      const result = await pgDb.select().from(pgUsers).where(eq(pgUsers.id, id)).limit(1);
      return result[0] ? pgUserToSqliteUser(result[0]) : null;
    }
    
    if (shouldUseDrizzle()) {
      const result = await sqliteDb.select().from(sqliteUsers).where(eq(sqliteUsers.id, id)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async findUserByEmail(email: string): Promise<User | null> {
    if (usePostgres()) {
      const result = await pgDb.select().from(pgUsers).where(eq(pgUsers.email, email)).limit(1);
      return result[0] ? pgUserToSqliteUser(result[0]) : null;
    }
    
    if (shouldUseDrizzle()) {
      const result = await sqliteDb.select().from(sqliteUsers).where(eq(sqliteUsers.email, email)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE email = ?', [email]);
  }

  static async findUserByUnlockToken(token: string): Promise<User | null> {
    if (usePostgres()) {
      const result = await pgDb.select().from(pgUsers).where(eq(pgUsers.unlockToken, token)).limit(1);
      return result[0] ? pgUserToSqliteUser(result[0]) : null;
    }
    
    if (shouldUseDrizzle()) {
      const result = await sqliteDb.select().from(sqliteUsers).where(eq(sqliteUsers.unlockToken, token)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<User>('SELECT * FROM users WHERE unlockToken = ?', [token]);
  }

  static async createUser(data: {
    id: string;
    email: string;
    name?: string;
    appAccountToken?: string;
  }): Promise<void> {
    if (usePostgres()) {
      await pgDb.insert(pgUsers).values({
        id: data.id,
        email: data.email,
        name: data.name,
        appAccountToken: data.appAccountToken,
      });
      return;
    }
    
    if (shouldUseDrizzle()) {
      await sqliteDb.insert(sqliteUsers).values({
        ...data,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    await run(
      `INSERT INTO users (id, email, name, appAccountToken, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.id, data.email, data.name || null, data.appAccountToken || null, now, now]
    );
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<void> {
    if (usePostgres()) {
      const pgUpdates: any = {};
      
      // Convert SQLite types to PostgreSQL types
      if ('accountLocked' in updates) {
        pgUpdates.accountLocked = updates.accountLocked === 1;
      }
      if ('accountLockedAt' in updates) {
        pgUpdates.accountLockedAt = convertUnixToTimestamp(updates.accountLockedAt);
      }
      if ('unlockTokenGeneratedAt' in updates) {
        pgUpdates.unlockTokenGeneratedAt = convertUnixToTimestamp(updates.unlockTokenGeneratedAt);
      }
      
      // Copy other fields
      ['email', 'name', 'appAccountToken', 'accountLockReason', 'unlockToken'].forEach(field => {
        if (field in updates) {
          pgUpdates[field] = updates[field as keyof User];
        }
      });
      
      await pgDb.update(pgUsers).set(pgUpdates).where(eq(pgUsers.id, id));
      return;
    }
    
    if (shouldUseDrizzle()) {
      await sqliteDb.update(sqliteUsers)
        .set({
          ...updates,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(sqliteUsers.id, id));
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
    if (usePostgres()) {
      const result = await pgDb.select().from(pgConversations).where(eq(pgConversations.id, id)).limit(1);
      return result[0] ? pgConversationToSqliteConversation(result[0]) : null;
    }
    
    if (shouldUseDrizzle()) {
      const result = await sqliteDb.select().from(sqliteConversations).where(eq(sqliteConversations.id, id)).limit(1);
      return result[0] || null;
    }
    
    return queryOne<Conversation>('SELECT * FROM conversations WHERE id = ?', [id]);
  }

  static async findUserConversations(userId: string, mode?: string): Promise<Conversation[]> {
    if (usePostgres()) {
      let query = pgDb.select().from(pgConversations).where(eq(pgConversations.userId, userId));
      
      if (mode) {
        query = query.where(and(eq(pgConversations.userId, userId), eq(pgConversations.mode, mode as any)));
      }
      
      const results = await query.orderBy(desc(pgConversations.createdAt));
      return results.map(pgConversationToSqliteConversation);
    }
    
    if (shouldUseDrizzle()) {
      let query = sqliteDb.select().from(sqliteConversations).where(eq(sqliteConversations.userId, userId));
      
      if (mode) {
        query = query.where(and(eq(sqliteConversations.userId, userId), eq(sqliteConversations.mode, mode)));
      }
      
      return query.orderBy(desc(sqliteConversations.createdAt));
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
    mode: string;
    recordingType: string;
    status?: string;
  }): Promise<void> {
    if (usePostgres()) {
      await pgDb.insert(pgConversations).values({
        id: data.id,
        userId: data.userId,
        mode: data.mode as any,
        recordingType: data.recordingType as any,
        status: (data.status || 'waiting') as any,
      });
      return;
    }
    
    if (shouldUseDrizzle()) {
      await sqliteDb.insert(sqliteConversations).values({
        ...data,
        status: data.status || 'waiting',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    await run(
      `INSERT INTO conversations (id, userId, mode, recordingType, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.userId, data.mode, data.recordingType, data.status || 'waiting', now, now]
    );
  }

  static async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    if (usePostgres()) {
      const pgUpdates: any = {};
      
      // Copy fields that exist in both schemas
      ['mode', 'recordingType', 'status', 'gptResponse', 'errorMessage', 'duration', 'transcript', 'analysis'].forEach(field => {
        if (field in updates) {
          pgUpdates[field] = updates[field as keyof Conversation];
        }
      });
      
      if ('completedAt' in updates && updates.completedAt) {
        pgUpdates.completedAt = convertUnixToTimestamp(updates.completedAt);
      }
      
      await pgDb.update(pgConversations).set(pgUpdates).where(eq(pgConversations.id, id));
      return;
    }
    
    if (shouldUseDrizzle()) {
      const updateData = {
        ...updates,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      log.debug('Drizzle update data', { id, updateData });
      await sqliteDb.update(sqliteConversations)
        .set(updateData)
        .where(eq(sqliteConversations.id, id));
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

  // Subscription operations
  static async findActiveSubscription(userId: string): Promise<Subscription | null> {
    if (usePostgres()) {
      const now = new Date();
      const result = await pgDb.select()
        .from(pgSubscriptions)
        .where(
          and(
            eq(pgSubscriptions.userId, userId),
            eq(pgSubscriptions.isActive, true),
            sql`${pgSubscriptions.expiresDate} IS NULL OR ${pgSubscriptions.expiresDate} > ${now}`
          )
        )
        .orderBy(desc(pgSubscriptions.createdAt))
        .limit(1);
      return result[0] ? pgSubscriptionToSqliteSubscription(result[0]) : null;
    }
    
    if (shouldUseDrizzle()) {
      const now = Math.floor(Date.now() / 1000);
      const result = await sqliteDb.select()
        .from(sqliteSubscriptions)
        .where(
          and(
            eq(sqliteSubscriptions.userId, userId),
            eq(sqliteSubscriptions.isActive, 1),
            sql`${sqliteSubscriptions.expiresDate} IS NULL OR ${sqliteSubscriptions.expiresDate} > ${now}`
          )
        )
        .orderBy(desc(sqliteSubscriptions.createdAt))
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
    conversationId: string;
    userId: string;
    audioFile?: string;
    audioKey?: string;
    transcription?: string;
    status?: string;
  }): Promise<void> {
    if (usePostgres()) {
      await pgDb.insert(pgAudios).values({
        conversationId: data.conversationId,
        userId: data.userId,
        audioFile: data.audioFile,
        audioKey: data.audioKey,
        transcription: data.transcription,
        status: (data.status || 'uploaded') as any,
      });
      return;
    }
    
    if (shouldUseDrizzle()) {
      await sqliteDb.insert(sqliteAudios).values({
        ...data,
        status: data.status || 'uploaded',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    await run(
      `INSERT INTO audios (conversationId, userId, audioFile, audioKey, transcription, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.conversationId,
        data.userId,
        data.audioFile || null,
        data.audioKey || null,
        data.transcription || null,
        data.status || 'uploaded',
        now,
        now
      ]
    );
  }

  static async findAudiosByConversationId(conversationId: string): Promise<Audio[]> {
    if (usePostgres()) {
      const results = await pgDb.select().from(pgAudios).where(eq(pgAudios.conversationId, conversationId));
      return results.map(pgAudioToSqliteAudio);
    }
    
    if (shouldUseDrizzle()) {
      return sqliteDb.select().from(sqliteAudios).where(eq(sqliteAudios.conversationId, conversationId));
    }

    return query<Audio>('SELECT * FROM audios WHERE conversationId = ?', [conversationId]);
  }

  // Session operations (PostgreSQL only)
  static async createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string | null> {
    if (!usePostgres()) {
      // Sessions not supported in SQLite
      return null;
    }

    const result = await pgDb.insert(pgSessions).values(data).returning({ id: pgSessions.id });
    return result[0]?.id || null;
  }

  static async findSessionByTokenHash(tokenHash: string): Promise<PgSession | null> {
    if (!usePostgres()) {
      return null;
    }

    const result = await pgDb.select().from(pgSessions).where(eq(pgSessions.tokenHash, tokenHash)).limit(1);
    return result[0] || null;
  }

  static async updateSessionLastUsed(sessionId: string): Promise<void> {
    if (!usePostgres()) {
      return;
    }

    await pgDb.update(pgSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(pgSessions.id, sessionId));
  }

  static async deleteExpiredSessions(): Promise<number> {
    if (!usePostgres()) {
      return 0;
    }

    const result = await pgDb.delete(pgSessions)
      .where(lte(pgSessions.expiresAt, new Date()))
      .returning({ id: pgSessions.id });
    
    return result.length;
  }

  // Transaction support
  static async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (usePostgres()) {
      return pgDb.transaction(callback);
    }
    
    if (shouldUseDrizzle()) {
      return sqliteDb.transaction(callback);
    }
    
    // For raw SQL, we need to implement transaction support
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
export const unifiedAdapter = UnifiedDatabaseAdapter;

// Alias methods for backward compatibility
export const getUserByEmail = UnifiedDatabaseAdapter.findUserByEmail;
export const getUserByUnlockToken = UnifiedDatabaseAdapter.findUserByUnlockToken;
export const updateUser = UnifiedDatabaseAdapter.updateUser;