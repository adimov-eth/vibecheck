import { eventBus } from "@/services/EventBus";
import type { AudioStatusUpdate } from "@/types/recording";
import { useStore } from "./store";

// Recording event listeners
eventBus.on<"recording" | "failed">("recording:status", (status) => {
  useStore.getState().setIsRecording(status === "recording");
});

eventBus.on<string>("recording:error", (error) => {
  useStore.getState().setRecordingError(error);
});

eventBus.on<number>("recording:progress", (progress) => {
  useStore.getState().setProcessingProgress(progress);
});

eventBus.on<AudioStatusUpdate>("audio:status", (data) => {
  const { audioId, status, error } = data;
  useStore.getState().updateAudioStatus(audioId, { status, error });
});

// WebSocket connection state listener
eventBus.on<{ connected: boolean; authenticated: boolean }>("websocket:connection_state", ({ connected, authenticated }) => {
  useStore.getState().setConnectionState(connected, authenticated);
}); 