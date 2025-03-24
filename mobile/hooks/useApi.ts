import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";

import {
  apiClient,
  type AnalysisResponse,
  type SubscriptionStatus,
  type UsageStats,
} from "@/services/api";
import { webSocketService } from "@/services/WebSocketService";
import type { SubscriptionType } from "@/types/subscription";
import { handleError } from "@/utils/errorUtils";
import { storeApi, useRecordingStore } from "./useTypedStore";

/**
 * Custom hook for using conversation-related API endpoints
 */
export const useConversations = () => {
  const queryClient = useQueryClient();
  const { setConversationId } = useRecordingStore();

  /**
   * Create a new conversation
   */
  const createConversation = useMutation({
    mutationFn: ({
      id,
      mode,
      recordingType,
    }: {
      id: string;
      mode: string;
      recordingType: "separate" | "live";
    }) => apiClient.createConversation(id, mode, recordingType),
    onSuccess: (conversationId) => {
      // Store in global state using typed store hook
      setConversationId(conversationId);

      // Subscribe to conversation updates via WebSocket
      webSocketService.subscribe(`conversation:${conversationId}`);
    },
    onError: (error) => {
      handleError(error, {
        defaultMessage: "Failed to create conversation",
        serviceName: "API",
        showToast: true,
      });
    },
  });

  /**
   * Get conversation status
   */
  const getConversationStatus = useCallback((conversationId: string | null) => {
    return useQuery({
      queryKey: ["conversation", conversationId, "status"],
      queryFn: () => apiClient.getConversationStatus(conversationId!),
      enabled: !!conversationId,
      refetchInterval: (query) => {
        // Poll faster if still processing, stop polling if complete or error
        const status = query.state.data?.status;
        if (!status) return 3000;
        if (status === "processing") return 3000;
        if (status === "waiting") return 5000;
        return false;
      },
    });
  }, []);

  /**
   * Get conversation result
   */
  const getConversationResult = useCallback((conversationId: string | null) => {
    return useQuery({
      queryKey: ["conversation", conversationId, "result"],
      queryFn: () => apiClient.getConversationResult(conversationId!),
      enabled: !!conversationId,
      // Disable automatic refetching - poll manually via status
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    });
  }, []);

  /**
   * Upload audio for a conversation
   */
  const uploadAudio = useMutation({
    mutationFn: ({
      conversationId,
      uri,
      onProgress,
    }: {
      conversationId: string;
      uri: string | string[];
      onProgress?: (progress: number) => void;
    }) => apiClient.uploadAudio(conversationId, uri, onProgress),
    onSuccess: (result, variables) => {
      // Invalidate status query to refresh progress
      queryClient.invalidateQueries({
        queryKey: ["conversation", variables.conversationId, "status"],
      });

      // Ensure we're subscribed to WebSocket updates for this conversation
      webSocketService.subscribe(`conversation:${variables.conversationId}`);

      // Notify WebSocket about audio upload completion
      webSocketService.send({
        type: "audio_uploaded",
        payload: {
          audioId: result.audioId,
          conversationId: variables.conversationId,
          timestamp: new Date().toISOString(),
        },
        topic: `conversation:${variables.conversationId}`,
      });
    },
    onError: (error, variables) => {
      handleError(error, {
        defaultMessage: "Failed to upload audio",
        serviceName: "API",
        showToast: true,
      });
      
      // Ensure we notify about the failure
      webSocketService.send({
        type: "audio_failed",
        payload: {
          conversationId: variables.conversationId,
          error: error instanceof Error ? error.message : "Unknown upload error",
          timestamp: new Date().toISOString(),
        },
        topic: `conversation:${variables.conversationId}`,
      });
    }
  });

  /**
   * Poll for conversation completion
   * @param conversationId Conversation ID
   * @param options Configuration options
   * @returns Function to stop polling
   */
  const pollForCompletion = useCallback(
    (
      conversationId: string,
      options: {
        onProgress?: (progress: number) => void;
        onComplete?: (result: AnalysisResponse) => void;
        onError?: (error: Error) => void;
      } = {},
    ) => {
      if (!conversationId) {
        if (options.onError) {
          options.onError(new Error("Conversation ID is required"));
        }
        return () => {};
      }

      // Use storeApi for direct store access
      const setProcessingProgress = (progress: number) => {
        storeApi.recording.setProcessingProgress(progress);
      };
      
      const setRecordingError = (error: string | null) => {
        storeApi.recording.setRecordingError(error);
      };

      let stopPolling = false;
      let pollInterval: NodeJS.Timeout | null = null;

      const checkStatus = async () => {
        if (stopPolling) return;

        try {
          const status = await apiClient.getConversationStatus(conversationId);

          // Update progress
          if (status.progress !== undefined) {
            const progress = Math.round(status.progress * 100);
            if (options.onProgress) {
              options.onProgress(progress);
            }
            setProcessingProgress(progress);
          }

          // Check if completed
          if (status.status === "completed") {
            try {
              const result =
                await apiClient.getConversationResult(conversationId);

              // Set final progress
              if (options.onProgress) {
                options.onProgress(100);
              }
              setProcessingProgress(100);

              // Notify completion
              if (options.onComplete) {
                options.onComplete(result);
              }

              // Stop polling
              stopPolling = true;
              if (pollInterval) {
                clearTimeout(pollInterval);
                pollInterval = null;
              }
            } catch (resultError) {
              if (options.onError) {
                options.onError(
                  resultError instanceof Error
                    ? resultError
                    : new Error("Failed to fetch result"),
                );
              }
              setRecordingError("Failed to fetch result");
            }
          } else if (status.status === "error") {
            // Handle error
            stopPolling = true;
            if (pollInterval) {
              clearTimeout(pollInterval);
              pollInterval = null;
            }

            const error = new Error(status.error || "Processing failed");
            if (options.onError) {
              options.onError(error);
            }
            setRecordingError(status.error || "Processing failed");
          } else {
            // Continue polling
            pollInterval = setTimeout(
              checkStatus,
              3000,
            ) as unknown as NodeJS.Timeout;
          }
        } catch (error) {
          const { message } = handleError(error, {
            defaultMessage: "Failed to check conversation status",
            serviceName: "API",
            showToast: false, // Don't show toast for polling errors
          });
          
          setRecordingError(message);
          
          if (options.onError) {
            options.onError(error instanceof Error ? error : new Error(message));
          }
          
          // Stop polling on error
          stopPolling = true;
          if (pollInterval) {
            clearTimeout(pollInterval);
            pollInterval = null;
          }
        }
      };

      // Start polling
      checkStatus();

      // Return function to stop polling
      return () => {
        stopPolling = true;
        if (pollInterval) {
          clearTimeout(pollInterval);
          pollInterval = null;
        }
      };
    },
    []
  );

  return {
    createConversation,
    getConversationStatus,
    getConversationResult,
    uploadAudio,
    pollForCompletion,
  };
};

/**
 * Custom hook for using usage-related API endpoints
 */
export const useUsage = (options?: UseQueryOptions<UsageStats, Error>) => {
  const { data, isLoading, error, refetch } = useQuery<UsageStats, Error>({
    queryKey: ["usage"],
    queryFn: () => apiClient.getUserUsageStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });

  /**
   * Check if user can create a new conversation
   * @param showAlert Show alert if limit reached
   * @returns Whether user can create a conversation
   */
  const checkCanCreateConversation = useCallback(
    async (showAlert = false): Promise<boolean> => {
      try {
        // Force refresh usage data
        const usageData = await refetch();

        // If subscribed, always allow
        if (usageData.data?.isSubscribed) {
          return true;
        }

        // Check remaining conversations
        const canCreate = (usageData.data?.remainingConversations || 0) > 0;

        if (!canCreate && showAlert) {
          // In real implementation, you would navigate to paywall
          console.log("No conversations remaining, showing paywall");

          // Set error in global state using the storeApi
          storeApi.recording.setRecordingError("You have reached your free usage limit");
        }

        return canCreate;
      } catch (error) {
        console.error("Error checking if can create conversation:", error);
        return false;
      }
    },
    [refetch],
  );

  return {
    usageData: data,
    isLoading,
    error,
    refetch,
    checkCanCreateConversation,
  };
};


/**
 * Custom hook for using subscription-related API endpoints
 */
export const useSubscription = () => {
  const queryClient = useQueryClient();

  /**
   * Get subscription status
   */
  const { data, isLoading, error, refetch } = useQuery<
    SubscriptionStatus,
    Error
  >({
    queryKey: ["subscription"],
    queryFn: () => apiClient.getSubscriptionStatus(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  /**
   * Verify a purchase receipt
   */
  const verifyReceipt = useMutation({
    mutationFn: (receiptData: string) =>
      apiClient.verifySubscriptionReceipt(receiptData),
    onSuccess: () => {
      // Invalidate subscription and usage queries
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });

      // Update global state using the storeApi
      if (data) {
        storeApi.subscription.setSubscriptionStatus(
          data.isSubscribed,
          data.subscription?.type as SubscriptionType,
          data.subscription?.expiresDate,
        );
      }
    },
  });

  return {
    subscriptionData: data,
    isLoading,
    error,
    refetch,
    verifyReceipt,
  };
};
