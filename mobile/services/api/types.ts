import { Platform } from "react-native";

export interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
  skipAuth?: boolean;
  forceReload?: boolean;
  ignoreRateLimit?: boolean;
}

export interface FileUploadOptions {
  uri: string;
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  data?: Record<string, unknown>;
  onProgress?: (progress: number) => void;
}

export interface ConversationStatus {
  status: "waiting" | "processing" | "completed" | "error";
  progress?: number;
  error?: string;
  estimatedTimeRemaining?: number;
}

export interface AnalysisResponse {
  summary: string;
  recommendations?: string[];
  sentiment?: string;
  additionalData?: Record<string, unknown>;
}

export interface UsageStats {
  isSubscribed: boolean;
  currentUsage: number;
  limit: number;
  remainingConversations: number;
  resetDate?: string;
}

export interface SubscriptionStatus {
  isSubscribed: boolean;
  subscription: {
    type: string | null;
    expiresDate: Date | null;
  };
}

export interface ApiConfig {
  baseUrl: string;
  version: string;
  timeout: number;
  rateLimitReset: number;
  platform: typeof Platform.OS;
  appVersion: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface OfflineOperation {
  type: string;
  data: Record<string, unknown>;
  priority: number;
}
