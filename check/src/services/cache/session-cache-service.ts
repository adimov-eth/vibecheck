import { cacheService } from './cache-service';
import { database } from '@/database';
import { sessions } from '@/database/schema';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { log } from '@/utils/logger';

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class SessionCacheService {
  private ttl = 7 * 24 * 60 * 60; // 7 days in seconds
  
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  async getSession(token: string): Promise<Session | null> {
    const tokenHash = this.hashToken(token);
    const cacheKey = `session:${tokenHash}`;
    
    // Try cache
    const cached = await cacheService.get<Session>(cacheKey);
    if (cached) {
      // Validate expiration
      if (new Date(cached.expiresAt) > new Date()) {
        return cached;
      }
      // Remove expired session from cache
      await this.removeSession(tokenHash);
      return null;
    }
    
    // Load from database
    const result = await database.select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1);
    
    const session = result[0] || null;
    
    if (session) {
      // Calculate remaining TTL
      const remainingTTL = Math.floor(
        (session.expiresAt.getTime() - Date.now()) / 1000
      );
      
      await cacheService.set(cacheKey, session, { 
        ttl: Math.min(remainingTTL, this.ttl),
        tags: [`user:${session.userId}`]
      });
    }
    
    return session;
  }
  
  async createSession(userId: string, token: string): Promise<Session> {
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttl * 1000);
    
    const [session] = await database.insert(sessions)
      .values({
        userId,
        tokenHash,
        expiresAt
      })
      .returning();
    
    // Cache immediately
    await cacheService.set(
      `session:${tokenHash}`, 
      session, 
      { 
        ttl: this.ttl,
        tags: [`user:${userId}`]
      }
    );
    
    log.info('Session created and cached', { userId });
    
    return session;
  }
  
  async removeSession(tokenHash: string): Promise<void> {
    // Remove from database
    await database.delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
    
    // Remove from cache
    await cacheService.invalidate(`session:${tokenHash}`);
    
    log.info('Session removed', { tokenHash: tokenHash.substring(0, 8) });
  }
  
  async removeUserSessions(userId: string): Promise<void> {
    // Get all user sessions to remove from cache
    const userSessions = await database.select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    
    // Remove from database
    await database.delete(sessions)
      .where(eq(sessions.userId, userId));
    
    // Remove each session from cache
    for (const session of userSessions) {
      await cacheService.invalidate(`session:${session.tokenHash}`);
    }
    
    log.info('All user sessions removed', { userId, count: userSessions.length });
  }
  
  async extendSession(token: string, additionalTime: number = 86400): Promise<Session | null> {
    const tokenHash = this.hashToken(token);
    const session = await this.getSession(token);
    
    if (!session) return null;
    
    // Calculate new expiration
    const newExpiresAt = new Date(
      Math.max(
        session.expiresAt.getTime(),
        Date.now()
      ) + additionalTime * 1000
    );
    
    // Update in database
    await database.update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.tokenHash, tokenHash));
    
    // Update cache
    const updatedSession = { ...session, expiresAt: newExpiresAt };
    const remainingTTL = Math.floor(
      (newExpiresAt.getTime() - Date.now()) / 1000
    );
    
    await cacheService.set(
      `session:${tokenHash}`,
      updatedSession,
      { 
        ttl: Math.min(remainingTTL, this.ttl),
        tags: [`user:${session.userId}`]
      }
    );
    
    return updatedSession;
  }
  
  async cleanExpiredSessions(): Promise<number> {
    // Get expired sessions
    const expired = await database.select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(gt(new Date(), sessions.expiresAt));
    
    if (expired.length === 0) return 0;
    
    // Remove from database
    await database.delete(sessions)
      .where(gt(new Date(), sessions.expiresAt));
    
    // Remove from cache
    for (const session of expired) {
      await cacheService.invalidate(`session:${session.tokenHash}`);
    }
    
    log.info('Expired sessions cleaned', { count: expired.length });
    return expired.length;
  }
}

export const sessionCacheService = new SessionCacheService();