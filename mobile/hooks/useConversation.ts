import { useEffect, useState } from "react";
import useStore from "../state/index";

export const useConversation = (conversationId: string) => {
  const { conversations, conversationLoading, getConversation } = useStore();
  const [error, setError] = useState<Error | null>(null);
  const conversation = conversations[conversationId];
  const isLoading = conversationLoading[conversationId] || false;

  useEffect(() => {
    if (!conversation && conversationId && !isLoading) {
      getConversation(conversationId).catch((err) => setError(err));
    }
  }, [conversation, conversationId, isLoading, getConversation]);

  return { conversation, isLoading, isError: !!error };
}; 