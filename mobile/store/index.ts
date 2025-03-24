import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { createAppSlice, type AppActions, type AppState } from "./appSlice";
import { createAuthSlice, type AuthActions, type AuthState } from "./authSlice";
import {
  createRecordingSlice,
  type RecordingActions,
  type RecordingState,
} from "./recordingSlice";
import {
  createSubscriptionSlice,
  type SubscriptionActions,
  type SubscriptionState,
} from "./subscriptionSlice";
import {
  createUsageSlice,
  type UsageActions,
  type UsageState,
} from "./usageSlice";

/**
 * Combined application state interface
 */
export interface StoreState
  extends AuthState,
    RecordingState,
    SubscriptionState,
    UsageState,
    AppState {}

/**
 * Combined application actions interface
 */
export interface StoreActions
  extends AuthActions,
    RecordingActions,
    SubscriptionActions,
    UsageActions,
    AppActions {}

/**
 * Create the store with all slices
 */
export const useStore = create<StoreState & StoreActions>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createRecordingSlice(...a),
        ...createSubscriptionSlice(...a),
        ...createUsageSlice(...a),
        ...createAppSlice(...a),
      }),
      {
        name: "vibecheck-storage",
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

// Store the store instance globally with proper typing
global.store = useStore;

/**
 * Export typed selectors for use in components
 */
export const useAuthState = () =>
  useStore((state) => ({
    token: state.token,
    isAuthenticated: state.isAuthenticated,
  }));

export const useRecordingState = () =>
  useStore((state) => ({
    isRecording: state.isRecording,
    recordingData: state.recordingData,
    conversationId: state.conversationId,
    processingProgress: state.processingProgress,
    audioStatus: state.audioStatus,
    error: state.recordingError,
    recordingMode: state.recordingMode,
    currentPartner: state.currentPartner,
    startRecording: state.startRecording,
    stopRecording: state.stopRecording,
    setConversationId: state.setConversationId,
    updateAudioStatus: state.updateAudioStatus,
    setRecordingError: state.setRecordingError,
    clearRecordings: state.clearRecordings,
    switchPartner: state.switchPartner,
  }));

export const useSubscriptionState = () =>
  useStore((state) => ({
    isSubscribed: state.isSubscribed,
    subscriptionPlan: state.subscriptionPlan,
    expiryDate: state.expiryDate,
    purchaseSubscription: state.purchaseSubscription,
    restorePurchases: state.restorePurchases,
    subscriptionProducts: state.subscriptionProducts,
  }));

export const useUsageState = () =>
  useStore((state) => ({
    remainingConversations: state.remainingConversations,
    usageLimit: state.usageLimit,
    currentUsage: state.currentUsage,
    resetDate: state.resetDate,
    checkCanCreateConversation: state.checkCanCreateConversation,
    refreshUsage: state.refreshUsage,
  }));

export const useAppState = () =>
  useStore((state) => ({
    appTheme: state.appTheme,
    isInitialized: state.isInitialized,
    hasCompletedOnboarding: state.hasCompletedOnboarding,
    setAppTheme: state.setAppTheme,
    completeOnboarding: state.completeOnboarding,
    initializeApp: state.initializeApp,
  }));