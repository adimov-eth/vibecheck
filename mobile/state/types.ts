export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  profileImageUrl: string;
}

export interface Conversation {
  id: string;
  status: "waiting" | "active" | "completed";
  mode: "mediator" | "counselor";
  recordingType: "separate" | "live";
}

export interface UploadProgress {
  [key: string]: number; // uploadId = `${serverConversationId}_${audioKey}`
}

export type UploadResult =
  | { success: true; url: string }
  | { success: false; error: string; audioUri: string; conversationId: string; audioKey: string };

export interface SubscriptionStatus {
  isActive: boolean;
  expiresDate: number | null;
  type: string | null;
  subscriptionId: number | null;
}

export interface UsageStats {
  currentUsage: number;
  limit: number;
  isSubscribed: boolean;
  remainingConversations: number;
  resetDate: number;
}

export interface ConversationSlice {
  conversations: Record<string, Conversation>;
  conversationLoading: Record<string, boolean>;
  createConversation: (
    mode: string,
    recordingType: "separate" | "live",
    localConversationId: string
  ) => Promise<string>;
  getConversation: (conversationId: string) => Promise<Conversation>;
}

export interface SubscriptionResponse {
  subscription: SubscriptionStatus;
  message?: string;
}

export interface UsageResponse {
  usage: UsageStats;
  message?: string;
}

export type WebSocketMessageType = 
  | 'transcript' 
  | 'analysis' 
  | 'error' 
  | 'status' 
  | 'connected' 
  | 'subscription_confirmed' 
  | 'unsubscription_confirmed' 
  | 'pong'
  | 'audio';

// Base message interface with common fields
export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  timestamp: string;
}

// Specialized message interfaces for better type safety
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
    content: string;
  };
}

export interface ErrorMessage extends BaseWebSocketMessage {
  type: 'error';
  payload: {
    conversationId?: string;
    error: string;
  };
}

export interface StatusMessage extends BaseWebSocketMessage {
  type: 'status';
  payload: {
    conversationId: string;
    status: string;
    gptResponse?: string;
    error?: string;
  };
}

export interface AudioMessage extends BaseWebSocketMessage {
  type: 'audio';
  payload: {
    audioId: string;
    status: 'processing' | 'transcribed' | 'failed';
    conversationId?: string;
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

export interface SubscriptionMessage extends BaseWebSocketMessage {
  type: 'subscription_confirmed' | 'unsubscription_confirmed';
  payload: {
    topic: string;
    activeSubscriptions: string[];
  };
}

export interface PongMessage extends BaseWebSocketMessage {
  type: 'pong';
  payload: {
    serverTime: string;
  };
}

// Union type for all WebSocket messages
export type WebSocketMessage = 
  | TranscriptMessage
  | AnalysisMessage
  | ErrorMessage
  | StatusMessage
  | AudioMessage
  | ConnectionMessage
  | SubscriptionMessage
  | PongMessage;

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
  setInitialUsageStats: (stats: UsageStats) => void;
}

export interface WebSocketSlice {
  socket: WebSocket | null;
  wsMessages: WebSocketMessage[];
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  maxReconnectDelay: number;
  isConnecting: boolean;
  calculateBackoff: () => number;
  connectWebSocket: () => Promise<void>;
  subscribeToConversation: (conversationId: string) => void;
  unsubscribeFromConversation: (conversationId: string) => void;
  clearMessages: () => void;
}

export interface PendingUpload {
  audioUri: string;
  conversationId: string;
  audioKey: string;
  localConversationId?: string;  // Making this optional since it's not always needed
}

export interface UploadSlice {
  uploadProgress: UploadProgress;
  uploadResults: { [uploadId: string]: UploadResult };
  pendingUploads: PendingUpload[];
  localToServerIds: { [localConversationId: string]: string };
  uploadAudio: (audioUri: string, conversationId: string, audioKey: string) => Promise<void>;
  addPendingUpload: (localConversationId: string, audioUri: string, audioKey: string) => void;
  processPendingUploads: (localConversationId: string) => void;
  setLocalToServerId: (localId: string, serverId: string) => void;
  clearUploadState: (conversationId: string) => void;
}

export interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  subscriptionOfferDetails?: {
    offerToken: string;
  }[];
}

export type StoreState = ConversationSlice &
  UploadSlice &
  SubscriptionSlice &
  WebSocketSlice;

export interface StoreActions {
  fetchToken: () => Promise<string | null>;
  getUserProfile: () => Promise<User | null>;
}

export const API_BASE_URL = "https://v.bkk.lol";
export const WS_URL = "wss://v.bkk.lol/ws";