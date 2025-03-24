import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

import type { AudioStatusUpdate } from "@/types/recording";
import { getClerkInstance } from "@clerk/clerk-expo";
import { errorService } from "./ErrorService";
import { eventBus } from "./EventBus";
import { networkService } from "./NetworkService";
import { queryClient } from "./QueryClient";

// Constants
const WS_RECONNECT_DELAY = 3000; // 3 seconds
const WS_MAX_RECONNECT_ATTEMPTS = 8;
const WS_PING_INTERVAL = 20000; // 20 seconds
const WS_INACTIVE_TIMEOUT = 30000; // 30 seconds
const WS_PENDING_MESSAGES_KEY = "vibecheck:pendingWsMessages";

// API base URL with fallback
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://v.bkk.lol";

/**
 * WebSocket message type
 */
export type WebSocketMessageType =
  | "connected"
  | "authenticate"
  | "subscribe"
  | "subscribed"
  | "unsubscribe"
  | "auth_error"
  | "conversation_progress"
  | "conversation_completed"
  | "conversation_failed"
  | "audio_processed"
  | "audio_failed"
  | "conversation_error"
  | "ping"
  | "pong"
  | "authentication_success"
  | "authentication_failed"
  | "audio_uploaded";

/**
 * WebSocket message interface
 */
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: Record<string, unknown>;
  topic?: string;
  id?: string;
  timestamp?: string;
}

/**
 * Type guard for WebSocketMessage
 */
function isWebSocketMessage(message: unknown): message is WebSocketMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as WebSocketMessage).type === "string" &&
    "payload" in message &&
    typeof (message as WebSocketMessage).payload === "object"
  );
}

/**
 * Get auth token from global store
 */
async function getAuthToken(): Promise<string | null> {
  const clerkInstance = getClerkInstance()
  // Use `getToken()` to get the current session token
  const token = await clerkInstance.session?.getToken() ?? null;
  return token;
}

interface ConversationData {
  status: string;
  processingProgress: number;
  error?: string;
}

interface AudioData {
  status: string;
}

/**
 * WebSocket Service for real-time updates
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private readonly url: string;
  private connectionState:
    | "connecting"
    | "connected"
    | "authenticated"
    | "disconnected"
    | "error" = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;
  private readonly messageHandlers: Map<
    string,
    Set<(message: WebSocketMessage) => void>
  > = new Map();
  private pendingMessages: WebSocketMessage[] = [];
  private isReconnecting = false;
  private readonly subscriptions: Set<string> = new Set();
  private readonly listeners: Set<
    (state: { connected: boolean; authenticated: boolean }) => void
  > = new Set();
  private appStateSubscription: { remove: () => void } | null = null;

  /**
   * Get WebSocket URL from API URL
   */
  private static getWebSocketUrl(apiUrl: string): string {
    // Clean up the API URL - remove trailing slash if present
    const cleanApiUrl = apiUrl.replace(/\/$/, "");

    // Extract the base URL (protocol + host)
    const url = new URL(cleanApiUrl);

    // Determine if we should use secure WebSocket (wss) or plain (ws)
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";

    // In development mode on iOS simulator, use localhost instead of host
    if (__DEV__ && Platform.OS === "ios") {
      url.hostname = "localhost";
      url.port = "3000"; // Default development port
    }

    // Construct the WebSocket URL with the ws path
    return `${protocol}//${url.host}/ws`;
  }

  /**
   * Get the WebSocketService singleton instance
   */
  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      const wsUrl = WebSocketService.getWebSocketUrl(API_BASE_URL);
      WebSocketService.instance = new WebSocketService(wsUrl);
    }
    return WebSocketService.instance;
  }

  private constructor(url: string) {
    this.url = url;

    // Load any pending messages from storage
    this.loadPendingMessages().catch((err) => {
      console.error("Failed to load pending WebSocket messages:", err);
    });

    // Set up app state monitoring
    this.setupAppStateMonitoring();
  }

  /**
   * Initialize WebSocket connection
   */
  public init(): void {
    // Set up network change listener
    networkService.addListener((status) => {
      if (status.isConnected && status.isInternetReachable) {
        this.connect();
      }
    });

    // Connect immediately if online
    networkService.isOnline().then((isOnline) => {
      if (isOnline) {
        this.connect();
      }
    });
  }

  /**
   * Clean up WebSocket resources
   */
  public cleanup(): void {
    this.disconnect();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.messageHandlers.clear();
    this.listeners.clear();
  }

  /**
   * Add a connection state listener
   * @param listener Function to call on state change
   * @returns Unsubscribe function
   */
  public addListener(
    listener: (state: { connected: boolean; authenticated: boolean }) => void,
  ): () => void {
    this.listeners.add(listener);

    // Call immediately with current state
    listener({
      connected:
        this.connectionState === "connected" ||
        this.connectionState === "authenticated",
      authenticated: this.connectionState === "authenticated",
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    // Don't connect if already connecting or connected
    if (
      (this.ws &&
        (this.ws.readyState === WebSocket.CONNECTING ||
          this.ws.readyState === WebSocket.OPEN)) ||
      this.isReconnecting
    ) {
      return;
    }

    this.connectionState = "connecting";
    this.notifyListeners();

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Get auth token for connection
    getAuthToken()
      .then((token) => {
        if (!token) {
          console.log("No auth token available for WebSocket connection");
          this.connectionState = "error";
          this.notifyListeners();
          return;
        }

        try {
          console.log("Connecting to WebSocket server:", this.url);
          this.ws = new WebSocket(this.url);

          // Set up event handlers
          this.ws.onopen = this.handleOpen;
          this.ws.onclose = this.handleClose;
          this.ws.onerror = this.handleError;
          this.ws.onmessage = this.handleMessage;

          // Reset reconnect attempts if successful
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
        } catch (error) {
          console.error("Error creating WebSocket connection:", error);
          this.connectionState = "error";
          this.notifyListeners();
          this.scheduleReconnect();
        }
      })
      .catch((error: Error) => {
        console.error("Error getting auth token for WebSocket:", error);
        this.connectionState = "error";
        this.notifyListeners();
        this.scheduleReconnect();
      });
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    console.log("Disconnecting from WebSocket server");

    // Clear intervals and timeouts
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close connection if open
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      this.ws.close();
    }

    this.connectionState = "disconnected";
    this.notifyListeners();
    this.ws = null;
  }

  /**
   * Subscribe to a topic
   * @param topic Topic to subscribe to
   */
  public subscribe(topic: string): void {
    this.subscriptions.add(topic);

    // If connected and authenticated, send subscription immediately
    if (
      this.connectionState === "authenticated" &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      this.send({
        type: "subscribe",
        topic,
        payload: {} as Record<string, unknown>,
      });
    } else if (this.connectionState !== "connecting") {
      // If not connecting or authenticated, try to connect
      this.connect();
    }
  }

  /**
   * Unsubscribe from a topic
   * @param topic Topic to unsubscribe from
   */
  public unsubscribe(topic: string): void {
    this.subscriptions.delete(topic);

    // If connected and authenticated, send unsubscription
    if (
      this.connectionState === "authenticated" &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      this.send({
        type: "unsubscribe",
        topic,
        payload: {} as Record<string, unknown>,
      });
    }
  }

  /**
   * Send a message via WebSocket
   * @param message Message to send
   */
  public send(message: WebSocketMessage): void {
    // Add timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    // Add ID if not provided (for tracking)
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
        this.pendingMessages.push(message);
        this.savePendingMessages();
      }
    } else {
      // Queue message for later
      this.pendingMessages.push(message);
      this.savePendingMessages();

      // Try to connect if not already connecting
      if (this.connectionState !== "connecting") {
        this.connect();
      }
    }
  }

  /**
   * Register a message handler
   * @param type Message type to handle
   * @param handler Handler function
   * @returns Unsubscribe function
   */
  public onMessage(
    type: WebSocketMessageType,
    handler: (message: WebSocketMessage) => void,
  ): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }

    this.messageHandlers.get(type)!.add(handler);

    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * Check if currently connected
   */
  public isConnected(): boolean {
    return (
      this.connectionState === "connected" ||
      this.connectionState === "authenticated"
    );
  }

  /**
   * Check if authenticated
   */
  public isAuthenticated(): boolean {
    return this.connectionState === "authenticated";
  }

  /**
   * Handle WebSocket open event
   */
  private readonly handleOpen = (): void => {
    console.log("WebSocket connection opened");
    this.connectionState = "connected";
    this.notifyListeners();
    this.lastMessageTime = Date.now();

    // Start ping interval
    this.startPingInterval();

    // Get fresh token for authentication
    getAuthToken()
      .then((token) => {
        if (token && this.ws?.readyState === WebSocket.OPEN) {
          // Send authentication message
          this.ws.send(
            JSON.stringify({
              type: "authenticate",
              payload: { token },
            }),
          );
        }
      })
      .catch((error: Error) => {
        console.error(
          "Error getting auth token for WebSocket authentication:",
          error,
        );
      });
  };

  /**
   * Handle WebSocket close event
   */
  private readonly handleClose = (event: CloseEvent): void => {
    console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
    this.connectionState = "disconnected";
    this.notifyListeners();

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Schedule reconnect if not explicitly closed by client
    if (event.code !== 1000) {
      this.scheduleReconnect();
    }
  };

  /**
   * Handle WebSocket error event
   */
  private readonly handleError = (event: Event): void => {
    console.error("WebSocket error:", event);
    this.connectionState = "error";
    this.notifyListeners();

    // No need to schedule reconnect here, close handler will be called
  };

  /**
   * Handle incoming WebSocket message
   */
  private readonly handleMessage = (event: MessageEvent): void => {
    this.lastMessageTime = Date.now();

    // Parse the message
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error("Error parsing WebSocket message:", error, event.data);
      return;
    }

    // Validate the message
    if (!isWebSocketMessage(message)) {
      console.warn("Received invalid WebSocket message:", message);
      return;
    }

    // Handle authentication messages separately
    if (
      message.type === "authentication_success" ||
      message.type === "auth_error" ||
      message.type === "authentication_failed"
    ) {
      this.handleAuthMessages(message);
      return;
    }

    // Handle other message types
    if (message.type === "ping") {
      // Respond to ping with pong
      this.send({
        type: "pong",
        id: message.id,
        payload: {} as Record<string, unknown>,
      });
      return;
    }

    // Special handling for specific message types
    switch (message.type) {
      case "conversation_progress":
        this.updateConversationProgress(message);
        break;

      case "conversation_completed":
        this.handleConversationCompleted(message);
        break;

      case "conversation_failed":
      case "conversation_error":
        this.handleConversationError(message);
        break;

      case "audio_processed":
        this.handleAudioProcessed(message);
        break;

      case "audio_failed":
        this.handleAudioFailed(message);
        break;
    }

    // Dispatch to registered handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error(
            `Error in WebSocket message handler for type ${message.type}:`,
            error,
          );
        }
      });
    }
  };

  /**
   * Update conversation progress
   */
  private updateConversationProgress(message: WebSocketMessage): void {
    const progress = message.payload.progress as number;
    if (typeof progress === "number") {
      const roundedProgress = Math.round(progress * 100);
      eventBus.emit("recording:progress", roundedProgress);
      
      if (message.topic) {
        const conversationId = message.topic.split(":")[1];
        if (conversationId) {
          queryClient.setQueryData<ConversationData>(["conversation", conversationId], {
            status: "processing",
            processingProgress: roundedProgress,
          });
        }
      }
    }
  }

  /**
   * Handle conversation completed message
   */
  private handleConversationCompleted(message: WebSocketMessage): void {
    eventBus.emit("recording:progress", 100);
    eventBus.emit("recording:complete", {});
    
    if (message.topic) {
      const conversationId = message.topic.split(":")[1];
      if (conversationId) {
        queryClient.setQueryData<ConversationData>(["conversation", conversationId], {
          status: "completed",
          processingProgress: 100,
        });
      }
    }
  }

  /**
   * Handle conversation error message
   */
  private handleConversationError(message: WebSocketMessage): void {
    if (!message.topic) return;
    const conversationId = message.topic.split(":")[1];
    if (!conversationId) return;
    
    const errorMessage = message.payload.error as string || "Unknown error";
    eventBus.emit("recording:error", errorMessage);
    
    errorService.handleRecordingError(errorMessage, {
      conversationId,
      updateStore: true,
      updateQueryCache: true,
    });
  }

  /**
   * Handle audio processed message
   */
  private handleAudioProcessed(message: WebSocketMessage): void {
    const audioId = message.payload.audioId as number;
    if (typeof audioId !== "number") return;
    
    eventBus.emit("audio:status", { audioId, status: "ready" } as AudioStatusUpdate);
    queryClient.setQueryData<AudioData>(["audio", audioId], { status: "ready" });
  }

  /**
   * Handle audio failed message
   */
  private handleAudioFailed(message: WebSocketMessage): void {
    const audioIdString = message.payload.audioId as string;
    if (!audioIdString) return;
    
    const errorMessage = message.payload.error as string || "Unknown error";
    const audioId = parseInt(audioIdString, 10);
    if (isNaN(audioId)) {
      console.error(`Invalid audio ID: ${audioIdString}`);
      eventBus.emit("recording:error", `Audio processing failed: ${errorMessage}`);
      return;
    }
    
    eventBus.emit("audio:status", { audioId, status: "failed", error: errorMessage } as AudioStatusUpdate);
    eventBus.emit("recording:error", `Audio processing failed: ${errorMessage}`);
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;

    // Check if we've reached max attempts
    if (this.reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `Maximum WebSocket reconnect attempts (${WS_MAX_RECONNECT_ATTEMPTS}) reached`,
      );
      this.connectionState = "error";
      this.notifyListeners();
      return;
    }

    this.reconnectAttempts++;

    // Calculate backoff with jitter
    const baseDelay = Math.min(
      30000, // max 30 seconds
      WS_RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
    );
    const jitter = 0.75 + Math.random() * 0.5; // 75-125% of base delay
    const delay = Math.floor(baseDelay * jitter);

    console.log(
      `Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${WS_MAX_RECONNECT_ATTEMPTS})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay) as unknown as NodeJS.Timeout;
  }

  /**
   * Reconnect with a fresh connection
   */
  private reconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0; // Reset for manual reconnection
    this.connect();
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      // Check if connection is still active
      const now = Date.now();
      const elapsed = now - this.lastMessageTime;

      if (elapsed > WS_INACTIVE_TIMEOUT) {
        console.log(
          `No WebSocket message received for ${elapsed}ms, reconnecting...`,
        );
        this.reconnect();
        return;
      }

      // Send ping if connected
      if (this.isConnected() && this.ws?.readyState === WebSocket.OPEN) {
        this.send({
          type: "ping",
          payload: {} as Record<string, unknown>,
        });
      }
    }, WS_PING_INTERVAL) as unknown as NodeJS.Timeout;
  }

  /**
   * Send all pending messages
   */
  private sendPendingMessages(): void {
    if (this.pendingMessages.length === 0 || !this.isAuthenticated()) {
      return;
    }

    console.log(
      `Sending ${this.pendingMessages.length} pending WebSocket messages`,
    );

    // Clone and clear the queue
    const messagesToSend = [...this.pendingMessages];
    this.pendingMessages = [];

    // Send each message
    for (const message of messagesToSend) {
      this.send(message);
    }

    // Update stored pending messages
    this.savePendingMessages();
  }

  /**
   * Save pending messages to AsyncStorage
   */
  private async savePendingMessages(): Promise<void> {
    try {
      // Only save messages that are worth retrying
      const messagesToSave = this.pendingMessages.filter(
        (msg) => msg.type !== "ping" && msg.type !== "pong",
      );

      if (messagesToSave.length > 0) {
        await AsyncStorage.setItem(
          WS_PENDING_MESSAGES_KEY,
          JSON.stringify(messagesToSave),
        );
      } else {
        await AsyncStorage.removeItem(WS_PENDING_MESSAGES_KEY);
      }
    } catch (error) {
      console.error("Error saving pending WebSocket messages:", error);
    }
  }

  /**
   * Load pending messages from AsyncStorage
   */
  private async loadPendingMessages(): Promise<void> {
    try {
      const messagesJson = await AsyncStorage.getItem(WS_PENDING_MESSAGES_KEY);
      if (messagesJson) {
        const messages = JSON.parse(messagesJson);
        if (Array.isArray(messages)) {
          // Filter valid messages
          this.pendingMessages = messages.filter(isWebSocketMessage);
          console.log(
            `Loaded ${this.pendingMessages.length} pending WebSocket messages`,
          );
        }
      }
    } catch (error) {
      console.error("Error loading pending WebSocket messages:", error);
    }
  }

  /**
   * Set up app state monitoring to reconnect when app comes to foreground
   */
  private setupAppStateMonitoring(): void {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        // App came to foreground
        networkService.isOnline().then((isOnline) => {
          if (isOnline && !this.isConnected()) {
            console.log("App returned to foreground, reconnecting WebSocket");
            this.reconnect();
          }
        });
      }
    };

    this.appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
  }

  /**
   * Notify all listeners of connection state changes
   */
  private notifyListeners(): void {
    const state = {
      connected: this.connectionState === "connected" || this.connectionState === "authenticated",
      authenticated: this.connectionState === "authenticated",
    };
    
    eventBus.emit("websocket:connection_state", state);
    
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error("Error in WebSocket listener:", error);
      }
    });
  }

  /**
   * Handle connection and authentication messages
   */
  private handleAuthMessages(message: WebSocketMessage): void {
    if (message.type === "authentication_success") {
      console.log("WebSocket authentication successful");
      this.connectionState = "authenticated";
      this.notifyListeners();

      // Resubscribe to all topics
      for (const topic of this.subscriptions) {
        this.send({
          type: "subscribe",
          topic,
          payload: {} as Record<string, unknown>,
        });
      }

      // Send any pending messages
      this.sendPendingMessages();
    } else if (
      message.type === "auth_error" ||
      message.type === "authentication_failed"
    ) {
      console.error("WebSocket authentication failed:", message.payload);
      this.connectionState = "error";
      this.notifyListeners();

      // Get fresh token and reconnect
      getAuthToken()
        .then((token) => {
          if (token) {
            // Reconnect with fresh token
            this.reconnect();
          }
        })
        .catch((error: Error) => {
          console.error(
            "Error refreshing token after WebSocket auth failure:",
            error,
          );
        });
    }
  }
}

// Export a singleton instance
export const webSocketService = WebSocketService.getInstance();
