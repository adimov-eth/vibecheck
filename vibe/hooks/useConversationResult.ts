// /Users/adimov/Developer/final/vibe/hooks/useConversationResult.ts
import { useEffect, useState } from 'react';
import useStore from '../state/index';
import type { ConversationResult } from '../state/types';
import { useConversation } from './useConversation'; // Import useConversation

export const useConversationResult = (conversationId: string) => {
  console.log(`[useConversationResult Hook] Initializing for conversation: ${conversationId}`);

  // State for this hook
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch conversation details via REST ---
  const {
    conversation: conversationDataRest,
    isLoading: conversationLoadingRest,
    error: conversationErrorRest,
  } = useConversation(conversationId);
  // --- End REST fetch ---

  // Get necessary functions and state from Zustand (WebSocket)
  const {
    conversationResults,
    subscribeToConversation,
    unsubscribeFromConversation,
    getConversationResultError
  } = useStore();

  // Get the specific result data for this conversation from WebSocket state
  const dataWs: ConversationResult | null = conversationResults?.[conversationId] || null;

  // Subscribe on mount and unsubscribe on unmount
  useEffect(() => {
    console.log(`[useConversationResult Hook] Subscribing to ${conversationId}`);
    subscribeToConversation(conversationId);

    return () => {
      console.log(`[useConversationResult Hook] Unsubscribing from ${conversationId}`);
      unsubscribeFromConversation(conversationId);
    };
  }, [conversationId, subscribeToConversation, unsubscribeFromConversation]);

  // Update loading and error state based on Zustand store AND REST API results
  useEffect(() => {
    const wsError = getConversationResultError(conversationId); // Get specific WS error
    const hasWsData = !!dataWs;
    const isWsProcessing = hasWsData && dataWs.status === 'processing';
    const isWsCompleted = hasWsData && dataWs.status === 'completed';
    const isWsError = hasWsData && dataWs.status === 'error';

    // Determine combined error
    const combinedError = wsError || conversationErrorRest || (isWsError ? dataWs.error : null);
    setError(combinedError || null);

    // Determine loading state
    // Loading if REST is loading OR if WS is still processing and REST hasn't finished/errored
    const stillLoading = conversationLoadingRest || (isWsProcessing && !conversationDataRest?.status);
    setIsLoading(stillLoading);

  }, [
      dataWs,
      conversationId,
      getConversationResultError,
      conversationDataRest, // Add REST data as dependency
      conversationLoadingRest, // Add REST loading as dependency
      conversationErrorRest // Add REST error as dependency
  ]);

  // Refetch might involve clearing local state and letting useEffect re-subscribe/fetch
  // Or trigger a specific action in the store if needed.
  const refetch = () => {
    console.log(`[useConversationResult Hook] Refetch requested for ${conversationId}`);
    setIsLoading(true);
    setError(null);
    // Re-trigger subscription effect
    unsubscribeFromConversation(conversationId);
    subscribeToConversation(conversationId);
    // Optionally trigger REST refetch if useConversation provides it
  };

  return {
    data: dataWs, // Return the WebSocket data
    conversationData: conversationDataRest, // Also return REST data
    isLoading,
    error,
    refetch,
  };
};