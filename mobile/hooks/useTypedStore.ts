import type { AudioStatus } from "@/services/RecordingService";
import type { StoreActions, StoreState } from "@/store";
import { useStore } from "@/store";
import type { AppTheme } from "@/store/appSlice";
import { SubscriptionType } from "@/types/subscription";
import { useShallow } from 'zustand/react/shallow';

/**
 * Type for a selector function that extracts state from the store
 */
type Selector<T> = (state: StoreState & StoreActions) => T;

/**
 * Create a selector for a slice of the store with memoization
 */
export function useStoreSelector<T>(selector: Selector<T>): T {
  return useStore(useShallow(selector));
}

/**
 * Hook for accessing auth state
 */
export function useAuthStore() {
  return useStore(
    useShallow((state) => ({
      token: state.token,
      isAuthenticated: state.isAuthenticated,
      setToken: state.setToken,
      setLoggedIn: state.setLoggedIn,
    }))
  );
}

/**
 * Hook for accessing recording state
 */
export function useRecordingStore() {
  return useStore(
    useShallow((state) => ({
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
      setRecordingData: state.setRecordingData,
      setProcessingProgress: state.setProcessingProgress,
    }))
  );
}

/**
 * Hook for accessing app state
 */
export function useAppStore() {
  return useStore(
    useShallow((state) => ({
      appTheme: state.appTheme,
      isInitialized: state.isInitialized,
      hasCompletedOnboarding: state.hasCompletedOnboarding,
      isLoading: state.isLoading,
      setAppTheme: state.setAppTheme,
      completeOnboarding: state.completeOnboarding,
      initializeApp: state.initializeApp,
    }))
  );
}

/**
 * Hook for accessing subscription state
 */
export function useSubscriptionStore() {
  return useStore(
    useShallow((state) => ({
      isSubscribed: state.isSubscribed,
      subscriptionPlan: state.subscriptionPlan,
      expiryDate: state.expiryDate,
      subscriptionProducts: state.subscriptionProducts,
      isLoading: state.isLoading,
      error: state.error,
      purchaseSubscription: state.purchaseSubscription,
      restorePurchases: state.restorePurchases,
      fetchSubscriptionProducts: state.fetchSubscriptionProducts,
      setSubscriptionStatus: state.setSubscriptionStatus,
    }))
  );
}

/**
 * Hook for accessing usage state
 */
export function useUsageStore() {
  return useStore(
    useShallow((state) => ({
      remainingConversations: state.remainingConversations,
      usageLimit: state.usageLimit,
      currentUsage: state.currentUsage,
      resetDate: state.resetDate,
      lastUsageCheck: state.lastUsageCheck,
      isLoading: state.isLoading,
      error: state.error,
      checkCanCreateConversation: state.checkCanCreateConversation,
      refreshUsage: state.refreshUsage,
      incrementUsage: state.incrementUsage,
    }))
  );
}

/**
 * Create a custom hook for composing multiple store domains
 */
export function createComposedStore<T extends Record<string, unknown>>(
  selectors: Record<string, Selector<unknown>>
): () => T {
  return () => {
    const result: Record<string, unknown> = {};
    
    // Use a single selector and shallow comparison
    const combinedSelector = useShallow((state: StoreState & StoreActions) => {
      for (const key in selectors) {
        const selector = selectors[key];
        result[key] = selector(state);
      }
      
      return result as T;
    });
    
    return useStore(combinedSelector);
  };
}

/**
 * Unified API for directly accessing and modifying store state outside of React components
 * Note: This should be used sparingly as it won't trigger re-renders
 */
export const storeApi = {
  // Auth domain
  auth: {
    // Getters
    getToken: () => useStore.getState().token,
    getIsAuthenticated: () => useStore.getState().isAuthenticated,
    
    // Actions
    setToken: (token: string) => useStore.setState({ token }),
  },
  
  // Recording domain
  recording: {
    // Getters
    getConversationId: () => useStore.getState().conversationId,
    getRecordingError: () => useStore.getState().recordingError,
    getProcessingProgress: () => useStore.getState().processingProgress,
    
    // Actions
    setConversationId: (conversationId: string | null) => {
      useStore.setState({ conversationId });
    },
    setRecordingError: (error: string | null) => {
      useStore.setState({ recordingError: error });
    },
    setProcessingProgress: (progress: number) => {
      useStore.setState({ processingProgress: progress });
    },
    clearRecordings: () => useStore.getState().clearRecordings(),
    updateAudioStatus: (audioId: number, status: AudioStatus) => {
      useStore.getState().updateAudioStatus(audioId, status);
    }
  },
  
  // Subscription domain
  subscription: {
    // Getters
    getIsSubscribed: () => useStore.getState().isSubscribed,
    getSubscriptionPlan: () => useStore.getState().subscriptionPlan,
    getExpiryDate: () => useStore.getState().expiryDate,
    
    // Actions
    setSubscriptionStatus: (
      isSubscribed: boolean,
      subscriptionPlan: SubscriptionType,
      expiryDate: Date | null,
    ) => {
      useStore.setState({
        isSubscribed,
        subscriptionPlan,
        expiryDate,
      });
    }
  },
  
  // Usage domain
  usage: {
    // Getters
    getRemainingConversations: () => useStore.getState().remainingConversations,
    getUsageLimit: () => useStore.getState().usageLimit,
    getCurrentUsage: () => useStore.getState().currentUsage,
    getResetDate: () => useStore.getState().resetDate,
    
    // Actions
    incrementUsage: () => useStore.getState().incrementUsage(),
    checkCanCreateConversation: () => useStore.getState().checkCanCreateConversation()
  },
  
  // App domain
  app: {
    // Getters
    getAppTheme: () => useStore.getState().appTheme,
    getIsInitialized: () => useStore.getState().isInitialized,
    getHasCompletedOnboarding: () => useStore.getState().hasCompletedOnboarding,
    
    // Actions
    setAppTheme: (theme: AppTheme) => useStore.getState().setAppTheme(theme),
    completeOnboarding: () => useStore.getState().completeOnboarding()
  }
};

// For backwards compatibility, also export the old getStoreState
/** @deprecated Use storeApi instead */
export const getStoreState = {
  auth: storeApi.auth,
  recording: storeApi.recording,
  subscription: storeApi.subscription,
  usage: storeApi.usage,
  app: storeApi.app
};