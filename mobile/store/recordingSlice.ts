import { type StateCreator } from "zustand";

import { eventBus } from "@/services/EventBus";
import { recordingService, type RecordingMode } from "@/services/RecordingService";

// Types
interface RecordingData {
  partner1: string;
  partner2?: string;
}

interface AudioStatus {
  status: "uploading" | "uploaded" | "processing" | "transcribed" | "failed";
  error?: string;
}

interface AudioStatusUpdate {
  audioId: number;
  status: AudioStatus["status"];
  error?: string;
}

export interface RecordingState {
  isRecording: boolean;
  recordingData: RecordingData | null;
  conversationId: string | null;
  processingProgress: number;
  audioStatus: Record<number, AudioStatus>;
  recordingError: string | null;
  recordingMode: RecordingMode;
  currentPartner: 1 | 2;
}

export interface RecordingActions {
  startRecording: (mode: string, recordingMode: RecordingMode) => Promise<string | null>;
  stopRecording: () => Promise<string | null>;
  setConversationId: (id: string | null) => void;
  setRecordingData: (data: RecordingData | null) => void;
  updateAudioStatus: (audioId: number, status: AudioStatus) => void;
  setRecordingError: (error: string | null) => void;
  clearRecordings: () => void;
  setProcessingProgress: (progress: number) => void;
  switchPartner: () => void;
}

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
      // Set recording mode in service
      recordingService.setRecordingMode(recordingMode);
      
      // Initialize conversation
      const conversationId = await recordingService.initializeConversation(mode, recordingMode);
      
      // Update state
      updateRecordingState(set, {
        recordingMode,
        conversationId,
        recordingError: null,
      });
      
      // Start recording
      const success = await recordingService.startRecording();
      
      if (success) {
        updateRecordingState(set, { isRecording: true });
      }
      
      return conversationId;
    } catch (error) {
      console.error("Failed to start recording:", error);
      
      const errorMsg = error instanceof Error ? error.message : "Failed to start recording";
      updateRecordingState(set, {
        isRecording: false,
        recordingError: errorMsg,
      });
      
      return null;
    }
  },

  stopRecording: async () => {
    try {
      // Stop recording via service
      const result = await recordingService.stopRecording();
      
      if (result) {
        // Update state based on the result
        updateRecordingState(set, { 
          isRecording: false,
          currentPartner: recordingService.getStatus().currentPartner,
        });
        
        // Update recording data
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
      updateRecordingState(set, {
        isRecording: false,
        recordingError: errorMsg,
      });
      
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
      audioStatus: {
        ...state.audioStatus,
        [audioId]: status,
      },
    }));
  },

  setRecordingError: (error: string | null) => {
    updateRecordingState(set, { recordingError: error });
  },

  clearRecordings: () => {
    // Reset service state
    recordingService.reset();
    
    // Reset store state
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
});

// Set up event listeners to keep store in sync with service
eventBus.on<"recording" | "failed">("recording:status", (status) => {
  if (global.store) {
    global.store.setState({ isRecording: status === "recording" });
  }
});

eventBus.on<string>("recording:error", (error) => {
  if (global.store) {
    global.store.setState({ recordingError: error });
  }
});

eventBus.on<number>("recording:progress", (progress) => {
  if (global.store) {
    global.store.setState({ processingProgress: progress });
  }
});

eventBus.on<AudioStatusUpdate>("audio:status", (data) => {
  if (global.store) {
    const { audioId, status, error } = data;
    global.store.setState((state) => ({
      audioStatus: {
        ...state.audioStatus,
        [audioId]: { status, error },
      },
    }));
  }
});