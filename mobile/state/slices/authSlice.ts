import { getClerkInstance } from "@clerk/clerk-expo";
import { StateCreator } from "zustand";
import { API_BASE_URL, AuthSlice, StoreState, User } from "../types";

export const createAuthSlice: StateCreator<StoreState, [], [], AuthSlice> = (
  set,
  get
) => ({
  token: null,
  userProfile: null,
  authLoading: false,
  error: null,

  setError: (error: string | null) => set({ error }),

  fetchToken: async () => {
  try {
    set({ authLoading: true, error: null });
    const clerkInstance = getClerkInstance();
    const token = (await clerkInstance.session?.getToken()) ?? null;
    set({ token, authLoading: false });
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching token";
    set({ error: message, authLoading: false });
    return null;
    }
  },

  getUserProfile: async () => {
    try {
      set({ authLoading: true, error: null });
      const token = get().token || (await get().fetchToken());
      if (!token) throw new Error("No authentication token available");
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Failed to fetch profile: ${response.statusText}`);
      const data = await response.json();
      const user = data.user as User;
      set({ userProfile: user, authLoading: false });
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error fetching profile";
      set({ error: message, authLoading: false });
      return null;
    }
  },

  logout: async () => {
    try {
      set({ authLoading: true, error: null });
      const clerkInstance = getClerkInstance();
      await clerkInstance.signOut();
      const socket = get().socket;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.close();
      }
      set({ token: null, userProfile: null, socket: null, authLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during logout";
      set({ error: message, authLoading: false });
    }
  },
});