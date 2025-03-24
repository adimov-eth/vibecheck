export type RecordingMode = "separate" | "live";

export type RecordingStatus =
  | "idle"
  | "requesting-permissions"
  | "permission-denied"
  | "preparing"
  | "recording"
  | "stopping"
  | "stopped"
  | "failed";

export interface AudioStatus {
  status: "uploading" | "uploaded" | "processing" | "transcribed" | "ready" | "failed";
  error?: string;
}

export interface RecordingData {
  partner1: string;
  partner2?: string;
}

export interface AudioStatusUpdate {
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
  setIsRecording: (isRecording: boolean) => void;
}

export interface RecordingServiceStatus {
  status: RecordingStatus;
  conversationId: string | null;
  currentPartner: 1 | 2;
  recordingMode: RecordingMode;
  error: string | null;
  recordingDuration?: number;
  isReleased?: boolean;
  hasPermission?: boolean;
} 