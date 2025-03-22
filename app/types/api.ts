/**
 * API Types for the VibeCheck application
 */

export interface AnalysisResponse {
  summary: string;
  recommendations?: string[];
  sentiment?: string;
  additionalData?: Record<string, any>;
}

export interface ConversationStatus {
  status: 'waiting' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
  estimatedTimeRemaining?: number;
}

export interface UsageStats {
  isSubscribed: boolean;
  currentUsage: number;
  limit: number;
  remainingConversations: number;
}

export interface SubscriptionInfo {
  isActive: boolean;
  productId: string;
  expiresDate: string | null;
  isInTrial: boolean;
} 