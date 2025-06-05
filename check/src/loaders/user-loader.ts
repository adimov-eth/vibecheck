import { BaseLoader } from './base-loader';
import { database } from '@/database';
import { users } from '@/database/schema';
import { inArray } from 'drizzle-orm';
import type { User } from '@/types';

export class UserLoader extends BaseLoader<string, User | null> {
  constructor() {
    super(async (userIds) => {
      // Batch load users by IDs
      const usersList = await database
        .select()
        .from(users)
        .where(inArray(users.id, userIds as string[]));
      
      // Create map for O(1) lookup
      const userMap = new Map(usersList.map(u => [u.id, u]));
      
      // Return in same order as requested
      return userIds.map(id => userMap.get(id as string) || null);
    });
  }
}

export class UserByEmailLoader extends BaseLoader<string, User | null> {
  constructor() {
    super(async (emails) => {
      // Batch load users by emails
      const usersList = await database
        .select()
        .from(users)
        .where(inArray(users.email, emails as string[]));
      
      const userMap = new Map(usersList.map(u => [u.email, u]));
      return emails.map(email => userMap.get(email as string) || null);
    });
  }
}