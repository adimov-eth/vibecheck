import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { createAuthSlice } from "./slices/authSlice";
import { createConversationSlice } from "./slices/conversationSlice";
import { createSubscriptionSlice } from "./slices/subscriptionSlice";
import { createUploadSlice } from "./slices/uploadSlice";
import { createWebSocketSlice } from "./slices/websocketSlice";
import type { StoreState } from "./types";

const useStore = create<StoreState>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createConversationSlice(...a),
        ...createUploadSlice(...a),
        ...createSubscriptionSlice(...a),
        ...createWebSocketSlice(...a),
      }),
      {
        name: "vibecheck-storage",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          userProfile: state.userProfile,
          conversations: state.conversations,
          subscriptionStatus: state.subscriptionStatus,
          usageStats: state.usageStats,
          subscriptionProducts: state.subscriptionProducts,
        }),
      }
    )
  )
);

export default useStore;
export * from "./types";
