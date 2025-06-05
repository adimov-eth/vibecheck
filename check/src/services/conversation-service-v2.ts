// src/services/conversation-service-v2.ts
// Refactored version using Drizzle ORM

import { randomUUIDv7 } from "bun";
import { eq, and, desc, sql } from 'drizzle-orm';
import { adapter } from '@/database/adapter';
import { drizzleDb, shouldUseDrizzle, conversations as conversationsTable } from '@/database/drizzle';
import type { Conversation } from '@/types';
import { formatError } from '@/utils/error-formatter';
import { log } from '@/utils/logger';

// Import the legacy service for gradual migration
import * as legacyService from './conversation-service';

/**
 * Service wrapper that uses either Drizzle or legacy implementation based on feature flag
 */
export class ConversationService {
  /**
   * Create a new conversation
   */
  static async createConversation({
    userId,
    mode,
    recordingType,
  }: {
    userId: string;
    mode: string;
    recordingType: 'separate' | 'live';
  }): Promise<Conversation> {
    // Use legacy if Drizzle is disabled
    if (!shouldUseDrizzle()) {
      return legacyService.createConversation({ userId, mode, recordingType });
    }

    try {
      const id = randomUUIDv7();
      const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

      // Check if user exists
      const user = await adapter.findUserById(userId);
      if (!user) {
        log.error("User not found in database", { userId });
        throw new Error(`User not found: ${userId}`);
      }

      // Create conversation using Drizzle
      await drizzleDb.insert(conversationsTable).values({
        id,
        userId,
        mode: mode as 'vent' | 'coach',
        recordingType: recordingType as 'separate' | 'live',
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
      });

      log.info("Created conversation", { conversationId: id, userId });

      return {
        id,
        userId,
        mode,
        recordingType,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        audioUrl: null,
        transcription: null,
        gptResponse: null,
        sentiment: null,
        emotions: null,
        keyTopics: null,
        suggestedActions: null,
        confidenceScore: null,
        errorMessage: null,
      };
    } catch (error) {
      log.error("Failed to create conversation", {
        userId,
        error: formatError(error),
      });
      throw error;
    }
  }

  /**
   * Get a conversation by ID
   */
  static async getConversation(conversationId: string): Promise<Conversation | null> {
    if (!shouldUseDrizzle()) {
      return legacyService.getConversation(conversationId);
    }

    try {
      const conversation = await adapter.findConversationById(conversationId);
      
      if (!conversation) {
        return null;
      }

      return this.mapConversation(conversation);
    } catch (error) {
      log.error("Failed to get conversation", {
        conversationId,
        error: formatError(error),
      });
      throw error;
    }
  }

  /**
   * Get all conversations for a user
   */
  static async getUserConversations(
    userId: string,
    mode?: string
  ): Promise<Conversation[]> {
    if (!shouldUseDrizzle()) {
      return legacyService.getUserConversations(userId, mode);
    }

    try {
      const conversations = await adapter.findUserConversations(
        userId,
        mode as 'vent' | 'coach' | undefined
      );

      return conversations.map(this.mapConversation);
    } catch (error) {
      log.error("Failed to get user conversations", {
        userId,
        error: formatError(error),
      });
      throw error;
    }
  }

  /**
   * Update conversation status and data
   */
  static async updateConversation(
    conversationId: string,
    updates: {
      status?: Conversation['status'];
      audioUrl?: string;
      transcription?: string;
      gptResponse?: string;
      sentiment?: string;
      emotions?: string[];
      keyTopics?: string[];
      suggestedActions?: string[];
      confidenceScore?: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    if (!shouldUseDrizzle()) {
      return legacyService.updateConversation(conversationId, updates);
    }

    try {
      log.info("Updating conversation", {
        conversationId,
        updates: Object.keys(updates),
      });

      // Prepare update data
      const updateData: Record<string, any> = {
        updatedAt: Math.floor(Date.now() / 1000),
      };

      // Add all provided updates
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.audioUrl !== undefined) updateData.audioUrl = updates.audioUrl;
      if (updates.transcription !== undefined) updateData.transcription = updates.transcription;
      if (updates.gptResponse !== undefined) updateData.gptResponse = updates.gptResponse;
      if (updates.sentiment !== undefined) updateData.sentiment = updates.sentiment;
      if (updates.emotions !== undefined) updateData.emotions = JSON.stringify(updates.emotions);
      if (updates.keyTopics !== undefined) updateData.keyTopics = JSON.stringify(updates.keyTopics);
      if (updates.suggestedActions !== undefined) updateData.suggestedActions = JSON.stringify(updates.suggestedActions);
      if (updates.confidenceScore !== undefined) updateData.confidenceScore = updates.confidenceScore;
      if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage;

      log.debug("Update data prepared", { conversationId, updateData });
      await adapter.updateConversation(conversationId, updateData);

      log.info("Updated conversation", { conversationId });
    } catch (error) {
      log.error("Failed to update conversation", {
        conversationId,
        error: formatError(error),
      });
      throw error;
    }
  }

  /**
   * Delete a conversation and its associated data
   */
  static async deleteConversation(
    conversationId: string,
    userId: string
  ): Promise<void> {
    if (!shouldUseDrizzle()) {
      return legacyService.deleteConversation(conversationId, userId);
    }

    try {
      // Verify ownership
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      if (conversation.userId !== userId) {
        throw new Error('Unauthorized');
      }

      // Delete using Drizzle
      await drizzleDb.delete(conversationsTable)
        .where(eq(conversationsTable.id, conversationId));

      log.info("Deleted conversation", { conversationId, userId });
    } catch (error) {
      log.error("Failed to delete conversation", {
        conversationId,
        error: formatError(error),
      });
      throw error;
    }
  }

  /**
   * Get recent active users for monitoring
   */
  static async getRecentActiveUsers(
    hours: number = 24
  ): Promise<{ userId: string; conversationCount: number }[]> {
    if (!shouldUseDrizzle()) {
      return legacyService.getRecentActiveUsers(hours);
    }

    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      // This is a more complex query that might need raw SQL even with Drizzle
      const result = await drizzleDb.select({
        userId: conversationsTable.userId,
        conversationCount: sql<number>`COUNT(*)`.as('conversationCount'),
      })
      .from(conversationsTable)
      .where(sql`${conversationsTable.createdAt} > ${cutoffTime}`)
      .groupBy(conversationsTable.userId)
      .orderBy(desc(sql`COUNT(*)`));

      return result;
    } catch (error) {
      log.error("Failed to get recent active users", { error: formatError(error) });
      throw error;
    }
  }

  /**
   * Helper to map database conversation to API conversation
   */
  private static mapConversation(dbConversation: any): Conversation {
    return {
      id: dbConversation.id,
      userId: dbConversation.userId,
      mode: dbConversation.mode,
      recordingType: dbConversation.recordingType || 'separate',
      status: dbConversation.status,
      createdAt: dbConversation.createdAt,
      updatedAt: dbConversation.updatedAt,
      audioUrl: dbConversation.audioUrl,
      transcription: dbConversation.transcription,
      gptResponse: dbConversation.gptResponse,
      sentiment: dbConversation.sentiment,
      emotions: typeof dbConversation.emotions === 'string' 
        ? JSON.parse(dbConversation.emotions) 
        : dbConversation.emotions,
      keyTopics: typeof dbConversation.keyTopics === 'string'
        ? JSON.parse(dbConversation.keyTopics)
        : dbConversation.keyTopics,
      suggestedActions: typeof dbConversation.suggestedActions === 'string'
        ? JSON.parse(dbConversation.suggestedActions)
        : dbConversation.suggestedActions,
      confidenceScore: dbConversation.confidenceScore,
      errorMessage: dbConversation.errorMessage,
    };
  }
}

// Export functions that match the existing API
export const createConversation = ConversationService.createConversation.bind(ConversationService);
export const getConversation = ConversationService.getConversation.bind(ConversationService);
export const getConversationById = ConversationService.getConversation.bind(ConversationService); // Alias for compatibility
export const getUserConversations = ConversationService.getUserConversations.bind(ConversationService);
export const updateConversation = ConversationService.updateConversation.bind(ConversationService);
export const updateConversationStatus = async (
  conversationId: string,
  status: string,
  gptResponse?: string | null,
  errorMessage?: string | null
): Promise<void> => {
  return ConversationService.updateConversation(conversationId, { 
    status: status as Conversation['status'], 
    gptResponse, 
    errorMessage 
  });
};
export const deleteConversation = ConversationService.deleteConversation.bind(ConversationService);
export const getRecentActiveUsers = ConversationService.getRecentActiveUsers.bind(ConversationService);