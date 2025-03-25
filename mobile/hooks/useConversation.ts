import { useEffect } from "react";
import useStore from "../state/index";

export const useConversation = (conversationId: string) => {
  const { conversations, conversationLoading, getConversation, error } = useStore();
  const conversation = conversations[conversationId];
  const isLoading = conversationLoading[conversationId] || false;

  useEffect(() => {
    if (!conversation && conversationId && !isLoading) {
      getConversation(conversationId).catch(() => {}); // Handle error in component if needed
    }
  }, [conversation, conversationId, isLoading, getConversation]);

  return { conversation, isLoading, isError: !!error };
}; 