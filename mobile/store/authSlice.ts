import { type StateCreator } from "zustand";

// Types
export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
}

export interface AuthActions {
  setToken: (token: string | null) => void;
  setLoggedIn: (isLoggedIn: boolean, token?: string) => void;
}

// Helper to update state
const updateAuthState = (
  set: (
    data: Partial<AuthState> | ((state: AuthState) => Partial<AuthState>)
  ) => void,
  data: Partial<AuthState>
) => {
  set((state: AuthState) => ({ ...state, ...data }));
};

// Create the auth slice
export const createAuthSlice: StateCreator<
  AuthState & AuthActions,
  [],
  [],
  AuthState & AuthActions
> = (set) => ({
  // Initial state
  token: null,
  isAuthenticated: false,

  // Actions
  setToken: (token: string | null) => {
    updateAuthState(set, {
      token,
      isAuthenticated: !!token,
    });
  },

  setLoggedIn: (isLoggedIn: boolean, token?: string) => {
    updateAuthState(set, {
      isAuthenticated: isLoggedIn,
      token: isLoggedIn ? token || null : null,
    });
  },
});