import type { RecordingActions, RecordingState } from "@/types/recording";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { createAppSlice, type AppActions, type AppState } from "./appSlice";
import { createAuthSlice, type AuthActions, type AuthState } from "./authSlice";
import { createRecordingSlice } from "./recordingSlice";
import { createSubscriptionSlice, type SubscriptionActions, type SubscriptionState } from "./subscriptionSlice";
import { createUsageSlice, type UsageActions, type UsageState } from "./usageSlice";
import { createWebSocketSlice, type WebSocketActions, type WebSocketState } from "./websocketSlice";

/**
 * Combined application state interface
 */
export interface StoreState
  extends AuthState,
    RecordingState,
    SubscriptionState,
    UsageState,
    AppState,
    WebSocketState {}

/**
 * Combined application actions interface
 */
export interface StoreActions
  extends AuthActions,
    RecordingActions,
    SubscriptionActions,
    UsageActions,
    AppActions,
    WebSocketActions {}

/**
 * Create the store with all slices
 */
export const createStore = () => create<StoreState & StoreActions>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createRecordingSlice(...a),
        ...createSubscriptionSlice(...a),
        ...createUsageSlice(...a),
        ...createAppSlice(...a),
        ...createWebSocketSlice(...a),
      }),
      {
        name: "vibecheck-storage",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          // Only persist non-sensitive data
          // Skip transient recording data, tokens, etc.
          appTheme: state.appTheme,
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          lastUsageCheck: state.lastUsageCheck,
        }),
      },
    ),
  ),
);

// Create store instance
export const useStore = createStore(); 