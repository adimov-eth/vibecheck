// /Users/adimov/Developer/final/vibe/state/slices/conversationSlice.ts
import { fetchWithAuth } from "@/utils/apiClient"; // Use the new API client
import type { StateCreator } from "zustand";
import type { Conversation, ConversationSlice, StoreState } from "../types";

// Removed: const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const createConversationSlice: StateCreator<
  StoreState,
  [],
  [],
  ConversationSlice
> = (set, get) => {
  // Removed: getAuthToken helper, now handled by fetchWithAuth

  return {
    conversations: {},
    conversationLoading: {},

    clearConversations: () => {
      set(() => ({
        conversations: {},
        conversationLoading: {},
      }));
      console.log("[ConversationSlice:clearConversations] Cleared conversations state.");
    },

    createConversation: async (
      mode: string,
      recordingType: "separate" | "live",
      localConversationId: string
    ): Promise<string> => {
      console.log(`[ConversationSlice:createConversation] Creating conversation. LocalID=${localConversationId}, Mode=${mode}, Type=${recordingType}`);
      // No loading state set here, handled by the calling hook if needed

      try {
        const data = await fetchWithAuth<{ conversation?: { id: string }, conversationId?: string }>( // Use fetchWithAuth
          '/conversations',
          {
            method: "POST",
            body: JSON.stringify({ mode, recordingType }),
          }
        );

        const serverConversationId = data.conversation?.id || data.conversationId;

        if (!serverConversationId) {
          console.error("[ConversationSlice:createConversation] Server response missing conversation ID. Response:", data);
          throw new Error("Server did not return a conversation ID");
        }
        console.log(`[ConversationSlice:createConversation] Conversation created successfully. ServerID=${serverConversationId}`);

        // Add conversation to local state immediately
        set((state) => ({
          conversations: {
            ...state.conversations,
            [serverConversationId]: {
              id: serverConversationId,
              status: "waiting", // Initial status
              mode,
              recordingType,
              // Add other default fields if necessary based on Conversation type
            } as Conversation, // Cast to Conversation type
          },
        }));

        // Set the mapping - this will trigger processing of any pending uploads for this local ID
        await get().setLocalToServerId(localConversationId, serverConversationId);

        return serverConversationId; // Return the server ID
      } catch (error) {
        console.error("[ConversationSlice:createConversation] Failed:", error);
        // Let the calling hook handle the error (including AuthenticationError)
        throw error;
      }
    },

    getConversation: async (conversationId: string): Promise<Conversation> => {
      console.log(`[ConversationSlice:getConversation] Fetching conversation ${conversationId}`);
      set((state) => ({
        conversationLoading: { ...state.conversationLoading, [conversationId]: true },
      }));

      try {
        const data = await fetchWithAuth<{ conversation: Conversation }>( // Use fetchWithAuth
          `/conversations/${conversationId}`
          // Default method is GET, no options needed unless overriding
        );

        // Assuming server returns the full conversation object in `data.conversation`
        const conversationData = data.conversation;
        if (!conversationData || !conversationData.id) {
          console.error(`[ConversationSlice:getConversation] Server response missing conversation data for ${conversationId}. Response:`, data);
          throw new Error("Invalid conversation data received from server");
        }
        console.log(`[ConversationSlice:getConversation] Fetched successfully: ${conversationId}`);

        set((state) => ({
          conversations: { ...state.conversations, [conversationId]: conversationData },
          conversationLoading: { ...state.conversationLoading, [conversationId]: false },
        }));
        return conversationData;
      } catch (error) {
        console.error(`[ConversationSlice:getConversation] Failed for ${conversationId}:`, error);
        set((state) => ({
          conversationLoading: { ...state.conversationLoading, [conversationId]: false },
        }));
        // Let the calling hook handle the error (including AuthenticationError)
        throw error;
      }
    },
  };
};