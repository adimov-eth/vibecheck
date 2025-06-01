// /Users/adimov/Developer/final/vibe/state/index.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
// Import the immer middleware
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { immer } from 'zustand/middleware/immer';
import { createConversationSlice } from "./slices/conversationSlice";
import { createSubscriptionSlice } from "./slices/subscriptionSlice";
import { createUploadSlice } from "./slices/uploadSlice";
import { createWebSocketSlice } from "./slices/websocketSlice";
import type { StoreState } from "./types";

const useStore = create<StoreState>()(
  devtools(
    persist(
      // Wrap the state creator function with the immer middleware
      immer((...a) => ({
        ...createConversationSlice(...a),
        ...createUploadSlice(...a),
        ...createSubscriptionSlice(...a),
        ...createWebSocketSlice(...a), // The cast inside this slice is now valid
      })), // End immer middleware wrap
      {
        name: "vibecheck-storage",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          // Only persist data that should survive app restarts and makes sense to hydrate
          conversations: state.conversations,
          subscriptionStatus: state.subscriptionStatus,
          usageStats: state.usageStats,
          subscriptionProducts: state.subscriptionProducts,
          // DO NOT persist localToServerIds - let initializeUploads handle loading it fresh
          // DO NOT persist uploadProgress or uploadResults - these are transient UI states
          // DO NOT persist wsMessages or conversationResults - these are transient WebSocket states
          // DO NOT persist socket, connectionPromise, etc. - these are runtime states
        }),
        version: 1,
        // skipHydration: true, // Keep true for faster startup, functions are available immediately
        // onRehydrateStorage can be used if you need to perform actions after persisted state is loaded
        // onRehydrateStorage: () => (state) => {
        //   console.log("Hydration finished");
        //   // Example: Trigger initialization *after* hydration if needed,
        //   // but initializeUploads is likely better called on app start regardless.
        //   // state?.initializeUploads();
        // }
      }
    )
  )
);

export default useStore;
export * from "./types";
