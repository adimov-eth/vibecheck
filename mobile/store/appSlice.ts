import AsyncStorage from "@react-native-async-storage/async-storage";
import { type StateCreator } from "zustand";

// Types
export type AppTheme = "light" | "dark" | "system";

export interface AppState {
  appTheme: AppTheme;
  isInitialized: boolean;
  hasCompletedOnboarding: boolean;
  isLoading: boolean;
}

export interface AppActions {
  setAppTheme: (theme: AppTheme) => void;
  completeOnboarding: () => void;
  initializeApp: () => Promise<void>;
}

// Storage keys
const APP_THEME_KEY = "vibecheck_app_theme";
const ONBOARDING_COMPLETED_KEY = "vibecheck_onboarding_completed";

// State update functions
const updateAppState = (
  set: (
    data: Partial<AppState> | ((state: AppState) => Partial<AppState>),
  ) => void,
  data: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => {
  if (typeof data === "function") {
    set((state: AppState) => ({ ...state, ...data(state) }));
  } else {
    set((state: AppState) => ({ ...state, ...data }));
  }
};

// Storage functions
const persistAppTheme = async (theme: AppTheme) => {
  await AsyncStorage.setItem(APP_THEME_KEY, theme);
};

const persistOnboardingStatus = async (completed: boolean) => {
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, completed.toString());
};

const loadAppPreferences = async () => {
  const [themeValue, onboardingValue] = await Promise.all([
    AsyncStorage.getItem(APP_THEME_KEY),
    AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
  ]);

  return {
    appTheme: (themeValue as AppTheme) || "system",
    hasCompletedOnboarding: onboardingValue === "true",
  };
};

export const createAppSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  AppState & AppActions
> = (set) => ({
  // Initial state
  appTheme: "system",
  isInitialized: false,
  hasCompletedOnboarding: false,
  isLoading: true,

  // Actions
  setAppTheme: (theme: AppTheme) => {
    updateAppState(set, { appTheme: theme });
    persistAppTheme(theme).catch((error) => {
      console.error("Failed to save app theme:", error);
    });
  },

  completeOnboarding: () => {
    updateAppState(set, { hasCompletedOnboarding: true });
    persistOnboardingStatus(true).catch((error) => {
      console.error("Failed to save onboarding status:", error);
    });
  },

  initializeApp: async () => {
    try {
      updateAppState(set, { isLoading: true });

      const preferences = await loadAppPreferences();

      updateAppState(set, {
        ...preferences,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to initialize app:", error);
      updateAppState(set, {
        isInitialized: true,
        isLoading: false,
      });
    }
  },
});
