import { apiClient } from "@/services/api";
import { type StateCreator } from "zustand";

// Types
export interface UsageState {
  remainingConversations: number;
  usageLimit: number;
  currentUsage: number;
  resetDate: string | null;
  lastUsageCheck: number | null;
  isLoading: boolean;
  error: string | null;
}

export interface UsageActions {
  refreshUsage: () => Promise<void>;
  checkCanCreateConversation: (showAlert?: boolean) => Promise<boolean>;
  incrementUsage: () => void;
}

// State update functions
const updateUsageState = (
  set: (
    data: Partial<UsageState> | ((state: UsageState) => Partial<UsageState>),
  ) => void,
  data: Partial<UsageState> | ((state: UsageState) => Partial<UsageState>),
) => {
  if (typeof data === "function") {
    set((state: UsageState) => ({ ...state, ...data(state) }));
  } else {
    set((state: UsageState) => ({ ...state, ...data }));
  }
};

const updateUsageData = (
  set: (
    data: Partial<UsageState> | ((state: UsageState) => Partial<UsageState>),
  ) => void,
  usageData: {
    currentUsage: number;
    limit: number;
    remainingConversations: number;
    resetDate?: string;
  },
) => {
  updateUsageState(set, {
    currentUsage: usageData.currentUsage,
    usageLimit: usageData.limit,
    remainingConversations: usageData.remainingConversations,
    resetDate: usageData.resetDate || null,
    lastUsageCheck: Date.now(),
    isLoading: false,
    error: null,
  });
};

// API calls (to be moved to a separate service)
const fetchUsageData = async () => {
  const usage = await apiClient.getUserUsageStats();
  return {
    currentUsage: usage.currentUsage,
    limit: usage.limit,
    remainingConversations: usage.remainingConversations,
    resetDate: usage.resetDate,
  };
}

export const createUsageSlice: StateCreator<
  UsageState & UsageActions,
  [],
  [],
  UsageState & UsageActions
> = (set, get) => ({
  // Initial state
  remainingConversations: 0,
  usageLimit: 10,
  currentUsage: 0,
  resetDate: null,
  lastUsageCheck: null,
  isLoading: false,
  error: null,

  // Actions
  refreshUsage: async () => {
    updateUsageState(set, { isLoading: true, error: null });

    try {
      const usageData = await fetchUsageData();
      updateUsageData(set, usageData);
    } catch (error) {
      console.error("Error refreshing usage data:", error);
      updateUsageState(set, {
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch usage data",
      });
    }
  },

  checkCanCreateConversation: async (showAlert = false) => {
    const state = get();
    const isSubscribed = false; // In real implementation, this would come from subscription state

    if (isSubscribed) return true;

    const isUsageOutdated =
      !state.lastUsageCheck ||
      Date.now() - state.lastUsageCheck > 5 * 60 * 1000;

    if (isUsageOutdated) {
      await get().refreshUsage();
    }

    const canCreate = state.remainingConversations > 0;

    if (!canCreate && showAlert) {
      console.log("Usage limit reached. Showing paywall.");
    }

    return canCreate;
  },

  incrementUsage: () => {
    updateUsageState(set, (state: UsageState) => ({
      currentUsage: state.currentUsage + 1,
      remainingConversations: Math.max(0, state.remainingConversations - 1),
    }));
  },
});
