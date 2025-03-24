import { recordingService } from "@/services/RecordingService";
import type {
  AudioStatus,
  RecordingActions,
  RecordingData,
  RecordingMode,
  RecordingState
} from "@/types/recording";
import { type StateCreator } from "zustand";

// State update function
const updateRecordingState = (
  set: (
    data: Partial<RecordingState> | ((state: RecordingState) => Partial<RecordingState>)
  ) => void,
  data: Partial<RecordingState> | ((state: RecordingState) => Partial<RecordingState>)
) => {
  if (typeof data === "function") {
    set((state: RecordingState) => ({ ...state, ...data(state) }));
  } else {
    set((state: RecordingState) => ({ ...state, ...data }));
  }
};

export const createRecordingSlice: StateCreator<
  RecordingState & RecordingActions,
  [],
  [],
  RecordingState & RecordingActions
> = (set, get) => ({
  // Initial state - synced with RecordingService
  isRecording: false,
  recordingData: null,
  conversationId: recordingService.getStatus().conversationId,
  processingProgress: 0,
  audioStatus: {},
  recordingError: null,
  recordingMode: "separate",
  currentPartner: 1,

  // Actions
  startRecording: async (mode: string, recordingMode: RecordingMode) => {
    try {
      recordingService.setRecordingMode(recordingMode);
      const conversationId = await recordingService.initializeConversation(mode, recordingMode);
      updateRecordingState(set, { recordingMode, conversationId, recordingError: null });
      const success = await recordingService.startRecording();
      if (success) updateRecordingState(set, { isRecording: true });
      return conversationId;
    } catch (error) {
      console.error("Failed to start recording:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to start recording";
      updateRecordingState(set, { isRecording: false, recordingError: errorMsg });
      return null;
    }
  },

  stopRecording: async () => {
    try {
      const result = await recordingService.stopRecording();
      if (result) {
        updateRecordingState(set, { 
          isRecording: false,
          currentPartner: recordingService.getStatus().currentPartner,
        });
        const state = get();
        if (result.partner === 1) {
          updateRecordingState(set, {
            recordingData: {
              partner1: result.uri,
              partner2: state.recordingData?.partner2,
            },
          });
        } else {
          updateRecordingState(set, {
            recordingData: {
              partner1: state.recordingData?.partner1 || "",
              partner2: result.uri,
            },
          });
        }
        return result.uri;
      } else {
        updateRecordingState(set, { isRecording: false });
        return null;
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to stop recording";
      updateRecordingState(set, { isRecording: false, recordingError: errorMsg });
      return null;
    }
  },

  setConversationId: (id: string | null) => {
    updateRecordingState(set, { conversationId: id });
  },

  setRecordingData: (data: RecordingData | null) => {
    updateRecordingState(set, { recordingData: data });
  },

  updateAudioStatus: (audioId: number, status: AudioStatus) => {
    updateRecordingState(set, (state: RecordingState) => ({
      audioStatus: { ...state.audioStatus, [audioId]: status },
    }));
  },

  setRecordingError: (error: string | null) => {
    updateRecordingState(set, { recordingError: error });
  },

  clearRecordings: () => {
    recordingService.reset();
    updateRecordingState(set, {
      isRecording: false,
      recordingData: null,
      conversationId: null,
      processingProgress: 0,
      audioStatus: {},
      recordingError: null,
      currentPartner: 1,
    });
  },

  setProcessingProgress: (progress: number) => {
    updateRecordingState(set, { processingProgress: progress });
  },

  switchPartner: () => {
    recordingService.switchPartner();
    updateRecordingState(set, { 
      currentPartner: recordingService.getStatus().currentPartner 
    });
  },

  setIsRecording: (isRecording: boolean) => {
    updateRecordingState(set, { isRecording });
  },
});