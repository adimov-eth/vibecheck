// /Users/adimov/Developer/final/vibe/state/types.ts
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  profileImageUrl: string;
}

export interface Conversation {
  id: string;
  status: "waiting" | "active" | "completed" | "error"; // Added error status
  mode: "mediator" | "counselor" | string; // Allow other string modes
  recordingType: "separate" | "live";
  createdAt?: string; // Optional timestamp
  updatedAt?: string; // Optional timestamp
  analysis?: string; // Optional analysis result
  transcript?: string; // Optional transcript
}

export interface UploadProgress {
  [key: string]: number; // uploadId = `${serverConversationId}_${audioKey}`
}

// This interface is for AsyncStorage, not directly in Zustand state
// export interface PendingUpload {
//   localConversationId: string;
//   audioUri: string;
//   audioKey: string;
// }

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  audioUri?: string;
  conversationId?: string; // Server ID
  audioKey?: string;
  localConversationId?: string; // Original local ID
}

export interface SubscriptionStatus {
  isActive: boolean;
  expiresDate: number | null; // Expect milliseconds or null
  type: string | null; // e.g., 'monthly', 'yearly'
  subscriptionId: number | null; // Backend subscription ID
}

export interface UsageStats {
  currentUsage: number;
  limit: number;
  isSubscribed: boolean;
  remainingConversations: number;
  resetDate: number; // Expect milliseconds timestamp
}

export interface ConversationSlice {
  conversations: Record<string, Conversation>;
  conversationLoading: Record<string, boolean>;
  clearConversations: () => void;
  createConversation: (
    mode: string,
    recordingType: "separate" | "live",
    localConversationId: string
  ) => Promise<string>; // Returns server ID
  getConversation: (conversationId: string) => Promise<Conversation>;
}

// API Response Types (used within slices)
export interface SubscriptionResponse {
  subscription: SubscriptionStatus;
  message?: string;
}

export interface UsageResponse {
  usage: UsageStats;
  message?: string;
}

// WebSocket Message Types
export type WebSocketMessageType =
  | 'transcript'
  | 'analysis'
  | 'error'
  | 'status'
  | 'connected'
  | 'subscription_confirmed'
  | 'unsubscription_confirmed'
  | 'pong'
  | 'audio' // Represents audio processing status updates
  | 'auth_success';

export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  timestamp: string; // ISO 8601 timestamp string
}

export interface TranscriptMessage extends BaseWebSocketMessage {
  type: 'transcript';
  payload: {
    conversationId: string;
    content: string;
  };
}

export interface AnalysisMessage extends BaseWebSocketMessage {
  type: 'analysis';
  payload: {
    conversationId: string;
    content: string; // The analysis result
  };
}

export interface ErrorMessage extends BaseWebSocketMessage {
  type: 'error';
  payload: {
    conversationId?: string; // Optional: error might be global
    error: string; // Error description
    code?: string; // Optional error code
  };
}

export interface StatusMessage extends BaseWebSocketMessage {
  type: 'status';
  payload: {
    conversationId: string;
    status: string; // e.g., 'processing_transcript', 'processing_analysis', 'completed', 'error'
    gptResponse?: string; // Optional: Analysis might come via status update
    error?: string; // Optional: Error details might come via status update
    progress?: number; // Optional: Progress percentage
  };
}

export interface AudioMessage extends BaseWebSocketMessage {
  type: 'audio';
  payload: {
    audioId: string; // Identifier for the specific audio segment (e.g., '1', '2', 'live')
    status: 'processing' | 'transcribed' | 'failed';
    conversationId?: string; // Associated conversation ID
    error?: string; // Error message if status is 'failed'
  };
}

export interface ConnectionMessage extends BaseWebSocketMessage {
  type: 'connected';
  payload: {
    message: string;
    serverTime: string;
    connectionId: string;
  };
}

export interface SubscriptionConfirmationMessage extends BaseWebSocketMessage {
  type: 'subscription_confirmed' | 'unsubscription_confirmed';
  payload: {
    topic: string; // e.g., 'conversation:uuid'
    activeSubscriptions: string[]; // List of currently active topics for this connection
  };
}

export interface PongMessage extends BaseWebSocketMessage {
  type: 'pong';
  payload: {
    serverTime: string;
  };
}

export interface AuthSuccessMessage extends BaseWebSocketMessage {
  type: 'auth_success';
  userId: string; // User ID confirmed by the backend
}

// Union type for all possible WebSocket messages
export type WebSocketMessage =
  | TranscriptMessage
  | AnalysisMessage
  | ErrorMessage
  | StatusMessage
  | AudioMessage
  | ConnectionMessage
  | SubscriptionConfirmationMessage
  | PongMessage
  | AuthSuccessMessage;

// Represents the state of a single conversation's results being processed via WebSocket
export interface ConversationResult {
  transcript?: string;
  analysis?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string | null;
  progress: number; // Percentage (0-100)
}

// Interface for subscription products fetched from the store (IAP)
export interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string; // Formatted price string
  localizedPrice?: string; // iOS specific formatted price
  subscriptionOfferDetails?: { // Android specific
    offerToken: string;
  }[];
}

// Define the slices that make up the total store state
export interface SubscriptionSlice {
  subscriptionStatus: SubscriptionStatus | null;
  usageStats: UsageStats | null;
  subscriptionProducts: SubscriptionProduct[];
  subscriptionLoading: boolean;
  subscriptionError: Error | null;
  verifySubscription: (receiptData: string) => Promise<SubscriptionResponse>;
  checkSubscriptionStatus: () => Promise<SubscriptionResponse>;
  getUsageStats: () => Promise<UsageResponse>;
  initializeStore: () => Promise<void>;
  cleanupStore: () => void;
  purchaseSubscription: (productId: string, offerToken?: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  setInitialUsageStats: (stats: UsageStats) => void; // Potentially redundant
}

export interface WebSocketSlice {
  socket: WebSocket | null;
  wsMessages: WebSocketMessage[]; // History of raw messages (limited size)
  conversationResults: { [conversationId: string]: ConversationResult }; // Processed results per conversation
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  maxReconnectDelay: number;
  isConnecting: boolean;
  isAuthenticated: boolean;
  connectionPromise: Promise<void> | null; // Track connection attempts
  calculateBackoff: () => number;
  connectWebSocket: () => Promise<void>;
  disconnectWebSocket: (code?: number, reason?: string) => void;
  subscribeToConversation: (conversationId: string) => Promise<void>;
  unsubscribeFromConversation: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
  getConversationResultError: (conversationId: string) => string | null;
  _restoreSubscriptions: () => Promise<void>;
}

export interface UploadSlice {
  uploadProgress: UploadProgress; // Map: uploadId -> percentage
  uploadResults: { [uploadId: string]: UploadResult }; // Map: uploadId -> result object
  localToServerIds: { [localConversationId: string]: string }; // Map: local UUID -> server UUID
  initializeUploads: () => Promise<void>; // Check AsyncStorage for pending uploads on startup
  uploadAudio: ( // Trigger foreground upload
    audioUri: string,
    conversationId: string, // Server ID
    audioKey: string, // '1', '2', or 'live'
    localConversationId?: string, // Original local ID
    isPersistedRetry?: boolean
  ) => Promise<void>;
  saveUploadIntent: ( // Save intent to upload (triggers foreground or saves to AsyncStorage)
    localConversationId: string,
    audioUri: string,
    audioKey: string
  ) => Promise<void>;
  setLocalToServerId: (localId: string, serverId: string) => Promise<void>; // Update mapping, trigger pending uploads
  clearUploadState: (conversationId: string) => void; // Clear UI state for a conversation
  retryUpload: (uploadId: string) => Promise<void>; // Manually retry a failed upload
}

// Combine all slices into the main store state type
export type StoreState = ConversationSlice &
  UploadSlice &
  SubscriptionSlice &
  WebSocketSlice;

// Optional: Define actions that might operate across slices (if needed)
// export interface StoreActions {
//   someCrossSliceAction: () => Promise<void>;
// }

// Define API constants
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://v.bkk.lol"; // Provide fallback
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "wss://v.bkk.lol/ws"; // Provide fallback