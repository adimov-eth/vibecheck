import { getClerkInstance } from "@clerk/clerk-expo";
import { StateCreator } from "zustand";
import { API_BASE_URL, Conversation, ConversationSlice, StoreState } from "../types";

export const createConversationSlice: StateCreator<
  StoreState,
  [],
  [],
  ConversationSlice
> = (set, get) => {
  const getAuthToken = async () => {
    const token = await getClerkInstance().session?.getToken();
    if (!token) throw new Error("No authentication token");
    return token;
  };

  return {
    conversations: {},
    conversationLoading: {},

    createConversation: async (
      mode: string,
      recordingType: "separate" | "live",
      localConversationId: string
    ) => {
      const token = await getAuthToken();

      const response = await fetch(`${API_BASE_URL}/conversations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, recordingType }),
      });

      if (!response.ok) throw new Error("Failed to create conversation");

      const data = await response.json();
      const serverConversationId = data.conversation?.id || data.conversationId;

      set((state) => ({
        conversations: {
          ...state.conversations,
          [serverConversationId]: {
            id: serverConversationId,
            status: "waiting",
            mode,
            recordingType,
          } as Conversation,
        },
        localToServerIds: {
          ...state.localToServerIds,
          [localConversationId]: serverConversationId,
        },
      }));

      get().processPendingUploads(localConversationId);
      return serverConversationId;
    },

    getConversation: async (conversationId: string) => {
      set((state) => ({
        conversationLoading: { ...state.conversationLoading, [conversationId]: true },
      }));

      try {
        const token = await getAuthToken();

        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Failed to fetch conversation");

        const data = await response.json();
        set((state) => ({
          conversations: { ...state.conversations, [conversationId]: data as Conversation },
          conversationLoading: { ...state.conversationLoading, [conversationId]: false },
        }));
        return data as Conversation;
      } catch (error) {
        set((state) => ({
          conversationLoading: { ...state.conversationLoading, [conversationId]: false },
        }));
        throw error;
      }
    },
  };
};