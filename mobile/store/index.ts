import { useStore } from "./store";

export type { StoreActions, StoreState } from "./store";

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

export { useStore };
