// Main client
export { apiClient } from "./client/ApiClient";

// Types
export type {
  AnalysisResponse, ApiConfig, ApiRequestOptions, ApiResponse,
  CacheEntry, ConversationStatus, FileUploadOptions, OfflineOperation, SubscriptionStatus, UsageStats
} from "./types";

// Error handling
export { ApiError } from "./error/ApiError";
export type { ApiErrorOptions } from "./error/ApiError";

export { CacheManager } from "./cache/CacheManager";
export { NetworkManager } from "./network/NetworkManager";
export { RateLimiter } from "./network/RateLimiter";
export { FileUploader } from "./upload/FileUploader";

