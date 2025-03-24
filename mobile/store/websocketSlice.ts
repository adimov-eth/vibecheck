import { type StateCreator } from "zustand";

export interface WebSocketState {
  connected: boolean;
  authenticated: boolean;
}

export interface WebSocketActions {
  setConnectionState: (connected: boolean, authenticated: boolean) => void;
}

export const createWebSocketSlice: StateCreator<
  WebSocketState & WebSocketActions,
  [],
  [],
  WebSocketState & WebSocketActions
> = (set) => ({
  // Initial state
  connected: false,
  authenticated: false,

  // Actions
  setConnectionState: (connected: boolean, authenticated: boolean) =>
    set({ connected, authenticated }),
}); 