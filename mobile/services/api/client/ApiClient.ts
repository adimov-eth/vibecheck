import { getClerkInstance } from "@clerk/clerk-expo";
import { Platform } from "react-native";
import { networkService } from "../../NetworkService";
import { CacheManager } from "../cache/CacheManager";
import { ApiError } from "../error/ApiError";
import { NetworkManager } from "../network/NetworkManager";
import { RateLimiter } from "../network/RateLimiter";
import { FileUploader } from "../upload/FileUploader";

import type {
  AnalysisResponse,
  ApiConfig,
  ApiRequestOptions,
  ConversationStatus,
  SubscriptionStatus,
  UsageStats
} from "../types";

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: "https://v.bkk.lol",
  version: "v1",
  timeout: 30000,
  rateLimitReset: 60000,
  platform: Platform.OS,
  appVersion: "1.0.0",
};

export class ApiClient {
  private static instance: ApiClient;
  private readonly config: ApiConfig;
  private readonly cache: CacheManager;
  private readonly network: NetworkManager;
  private readonly rateLimiter: RateLimiter;
  private readonly fileUploader: FileUploader;
  private readonly pendingRequests: Map<string, Promise<unknown>> = new Map();

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  private constructor(config: Partial<ApiConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new CacheManager();
    this.network = new NetworkManager(this.config);
    this.rateLimiter = new RateLimiter(this.config.rateLimitReset);
    this.fileUploader = new FileUploader(this.config);

    this.registerOfflineHandlers();
  }

  private registerOfflineHandlers(): void {
    networkService.registerOfflineOperationHandler(
      "refresh_token",
      this.handleOfflineTokenRefresh.bind(this),
    );
    networkService.registerOfflineOperationHandler(
      "create_conversation",
      this.handleOfflineConversationCreation.bind(this),
    );
    networkService.registerOfflineOperationHandler(
      "upload_audio",
      this.handleOfflineAudioUpload.bind(this),
    );
  }

  private getRequestKey(
    method: string,
    endpoint: string,
    options: ApiRequestOptions = {},
  ): string {
    const { params, body } = options;
    return `${method}:${endpoint}:${JSON.stringify(params)}:${JSON.stringify(body)}`;
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    const {
      skipAuth = false,
      forceReload = false,
      ignoreRateLimit = false,
    } = options;

    const requestKey = this.getRequestKey(method, endpoint, options);

    if (!forceReload && this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey) as Promise<T>;
    }

    if (!ignoreRateLimit) {
      this.rateLimiter.checkRateLimit(endpoint);
    }

    const isOnline = await networkService.isOnline();
    if (!isOnline) {
      if (method === "GET") {
        const cachedData = await this.cache.get<T>(endpoint, options.params);
        if (cachedData) {
          return cachedData;
        }
      }

      throw ApiError.network("No network connection available");
    }

    if (!skipAuth) {
      try {
        const clerkInstance = getClerkInstance()
        // Use `getToken()` to get the current session token
        const token = await clerkInstance.session?.getToken()
        if (!token) {
          throw ApiError.auth("No valid session token found");
        }

        // Add token to options for network request
        options.token = token;
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          throw error;
        }
        throw ApiError.auth("Failed to get auth token");
      }
    }

    const requestPromise = this.network
      .request<T>(method, endpoint, options)
      .then((response) => {
        if (method === "GET") {
          this.cache.set(endpoint, response.data, options.params);
        }
        return response.data;
      })
      .catch((error) => {
        if (error instanceof ApiError && error.isRateLimitError) {
          const retryAfter =
            error.status === 429
              ? parseInt(error.message.split(" ")[3])
              : undefined;
          this.rateLimiter.setRateLimit(endpoint, retryAfter);
        }
        throw error;
      });

    this.pendingRequests.set(requestKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(requestKey);
    }
  }

  private async handleOfflineTokenRefresh(): Promise<void> {
    console.log("Handling offline token refresh");
  }

  private async handleOfflineConversationCreation(data: Record<string, unknown>): Promise<void> {
    const typedData = data as { id: string; mode: string; recordingType: "separate" | "live" };
    try {
      await this.createConversation(typedData.id, typedData.mode, typedData.recordingType);
    } catch (error) {
      console.error("Error handling offline conversation creation:", error);
      throw error;
    }
  }

  private async handleOfflineAudioUpload(data: Record<string, unknown>): Promise<void> {
    const typedData = data as { conversationId: string; uri: string | string[] };
    try {
      await this.uploadAudio(typedData.conversationId, typedData.uri);
    } catch (error) {
      console.error("Error handling offline audio upload:", error);
      throw error;
    }
  }

  // Public API Methods

  async get<T>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<T> {
    return this.makeRequest<T>("GET", endpoint, options);
  }

  async post<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<T> {
    return this.makeRequest<T>("POST", endpoint, { ...options, body });
  }

  async put<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<T> {
    return this.makeRequest<T>("PUT", endpoint, { ...options, body });
  }

  async delete<T>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<T> {
    return this.makeRequest<T>("DELETE", endpoint, options);
  }

  // Domain-Specific Methods

  async createConversation(
    id: string,
    mode: string,
    recordingType: "separate" | "live",
  ): Promise<string> {
    try {
      const response = await this.post<{ conversationId: string }>(
        "/conversations",
        {
          id,
          mode,
          recordingType,
        },
      );

      return response.conversationId;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await networkService.queueOfflineOperation(
          "create_conversation",
          { id, mode, recordingType },
          3,
        );
        return id;
      }

      throw error;
    }
  }

  async getConversationStatus(
    conversationId: string,
  ): Promise<ConversationStatus> {
    return this.get<ConversationStatus>(
      `/conversations/${conversationId}/status`,
    );
  }

  async getConversationResult(
    conversationId: string,
  ): Promise<AnalysisResponse> {
    return this.get<AnalysisResponse>(
      `/conversations/${conversationId}/result`,
    );
  }

  async uploadAudio(
    conversationId: string,
    uri: string | string[],
    onProgress?: (progress: number) => void,
  ): Promise<{ audioId: number }> {
    const clerkInstance = getClerkInstance()
    // Use `getToken()` to get the current session token
    const token = await clerkInstance.session?.getToken();

    if (!token) {
      throw ApiError.auth("No valid session token found");
    }

    if (Array.isArray(uri)) {
      const results = await this.fileUploader.uploadMultiple<{
        audioId: number;
      }>("/audio", token, uri, {
        fieldName: "audio",
        data: { conversationId },
        onProgress,
      });

      return results[results.length - 1];
    }

    return this.fileUploader.upload<{ audioId: number }>("/audio", token, {
      uri,
      fieldName: "audio",
      mimeType: uri.endsWith(".m4a") ? "audio/m4a" : "audio/wav",
      data: { conversationId },
      onProgress,
    });
  }

  async getUserUsageStats(): Promise<UsageStats> {
    return this.get<UsageStats>("/usage/stats");
  }

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.get<SubscriptionStatus>("/subscriptions/status");
  }

  async verifySubscriptionReceipt(
    receiptData: string,
  ): Promise<SubscriptionStatus> {
    return this.post<SubscriptionStatus>("/subscriptions/verify", {
      receiptData,
    });
  }
}

// Export singleton instance
export const apiClient = ApiClient.getInstance();
