// /Users/adimov/Developer/final/vibe/hooks/useConversation.ts
import { ApiError, AuthenticationError } from "@/utils/apiClient"; // Import custom errors
import { useEffect, useState } from "react";
import useStore from "../state/index";
import { useAuthentication } from "./useAuthentication"; // Import useAuthentication

export const useConversation = (conversationId: string) => {
  const { conversations, conversationLoading, getConversation } = useStore();
  const { signOut } = useAuthentication(); // Get signOut function
  const [error, setError] = useState<string | null>(null); // Store error message string
  const conversation = conversations[conversationId];
  const isLoading = conversationLoading[conversationId] || false;

  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversation && conversationId && !isLoading) {
        setError(null); // Clear previous errors
        try {
          await getConversation(conversationId);
        } catch (err) {
          console.error(`[useConversation] Error fetching conversation ${conversationId}:`, err);
          if (err instanceof AuthenticationError) {
            // Handle specific authentication error
            setError("Your session has expired. Please sign in again.");
            await signOut(); // Trigger sign out
          } else if (err instanceof ApiError) {
            // Handle other API errors
            setError(`Failed to load conversation: ${err.message} (Status: ${err.status})`);
          } else {
            // Handle generic errors
            setError("An unexpected error occurred while loading the conversation.");
          }
        }
      }
    };

    fetchConversation();
  }, [conversation, conversationId, isLoading, getConversation, signOut]); // Add signOut dependency

  return {
    conversation,
    isLoading,
    isError: !!error,
    error // Expose the error message
  };
};