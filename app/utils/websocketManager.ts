/**
 * WebSocket Manager for handling real-time communication
 * Replaces polling with an efficient WebSocket connection
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { AppState, AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

// Constants
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 8; // Max number of reconnection attempts
const MAX_RECONNECT_DELAY = 30000; // Max delay between reconnections (30 seconds)
const DEFAULT_WS_URL = Constants.expoConfig?.extra?.apiUrl || 'https://v.bkk.lol';
const WS_RECONNECT_DELAY = 3000; // 3 seconds
const WS_INACTIVE_TIMEOUT = 30000; // 30 seconds
const WS_PING_INTERVAL = 20000; // 20 seconds
const WS_PENDING_MESSAGES_KEY = 'vibecheck:pendingWsMessages';

// Connection state type
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

// WebSocket event types
export interface WebSocketMessage {
  type: string;
  payload: any;
  topic?: string;
  id?: string;
  timestamp?: string;
}

// Define specific WebSocket message types
export type WebSocketMessageType = 
  | 'connected'
  | 'authenticate'
  | 'subscribe'
  | 'subscribed'
  | 'unsubscribe'
  | 'auth_error'
  | 'conversation_progress'
  | 'conversation_completed'
  | 'conversation_failed'
  | 'audio_processed'
  | 'audio_failed'
  | 'conversation_error'
  | 'ping'
  | 'pong'
  | 'authentication_success'
  | 'authentication_failed';

// Define specific payload types
export interface AudioProcessedPayload {
  audioId: number;
  status: 'transcribed';
}

export interface AudioFailedPayload {
  audioId: number;
  error: string;
}

export interface ConversationCompletedPayload {
  conversationId: string;
  status: 'completed';
}

export interface ConversationFailedPayload {
  conversationId: string;
  error: string;
}

// Define the WebSocketManager hook return type
export interface WebSocketManagerHook {
  connectionState: ConnectionState;
  sendMessage: (type: string, payload: any, topic?: string) => void;
  subscribe: (topicId: string) => void;
  unsubscribe: (topicId: string) => void;
  lastMessage: WebSocketMessage | null;
  reconnect: () => void;
  isSubscribed: (topicId: string) => boolean;
}

/**
 * Get the websocket URL with appropriate protocol based on API URL
 */
export function getWebSocketUrl(apiUrl = DEFAULT_WS_URL): string {
  // Clean up the API URL - remove trailing slash if present
  const cleanApiUrl = apiUrl.replace(/\/$/, '');
  
  // Extract the base URL (protocol + host)
  let url = new URL(cleanApiUrl);
  
  // Determine if we should use secure WebSocket (wss) or plain (ws)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  
  // In development mode on iOS simulator, use localhost instead of host
  if (__DEV__ && Platform.OS === 'ios') {
    url.hostname = 'localhost';
    url.port = '3000'; // Default development port
  }
  
  // Construct the WebSocket URL with the ws path
  return `${protocol}//${url.host}/ws`;
}

// Singleton WebSocket instance to share across the app
let globalWsInstance: {
  instance: WebSocket | null;
  url: string | null;
  token: string | null;
  subscriptions: Set<string>;
} = {
  instance: null,
  url: null,
  token: null,
  subscriptions: new Set(),
};

/**
 * Custom hook for managing WebSocket connections
 * Handles authentication, reconnection, and message processing
 * 
 * @param wsUrlOverride - Optional override for the WebSocket server URL
 * @returns WebSocketManager interface with connection state and methods
 */
export function useWebSocketManager(wsUrlOverride?: string): WebSocketManagerHook {
  const { getFreshToken } = useAuthToken();
  const wsUrl = wsUrlOverride || getWebSocketUrl();
  
  const reconnectAttempts = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => 
    globalWsInstance.instance ? 
      (globalWsInstance.instance.readyState === WebSocket.OPEN ? 'connected' : 'disconnected') : 
      'disconnected'
  );
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const localSubscriptions = useRef<Set<string>>(new Set());

  /**
   * Calculate exponential backoff delay for reconnection
   * Uses exponential backoff with jitter for better distribution
   */
  const getReconnectDelay = useCallback((): number => {
    // Calculate base delay with exponential backoff (2^attempts * base interval)
    const baseDelay = Math.min(
      RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts.current),
      MAX_RECONNECT_DELAY
    );
    
    // Add jitter (±25%) to prevent synchronized reconnection attempts
    const jitterFactor = 0.75 + (Math.random() * 0.5); // 0.75-1.25
    return Math.floor(baseDelay * jitterFactor);
  }, []);

  /**
   * Global handler for incoming WebSocket messages
   * Processes different message types and dispatches them appropriately
   */
  const handleIncomingMessage = useCallback((message: WebSocketMessage) => {
    // Skip internal messages like 'subscribed' or 'connected'
    if (
      message.type === 'subscribed' || 
      message.type === 'connected' || 
      message.type === 'authenticate'
    ) {
      return;
    }

    // Extract the topic and target ID if available
    let targetId = '';
    if (message.topic) {
      const topicParts = message.topic.split(':');
      if (topicParts.length > 1) {
        targetId = topicParts[1];
      }
    }

    // Handle different message types
    switch (message.type) {
      case 'conversation_progress':
      case 'conversation_completed':
      case 'conversation_failed':
        // These are handled by the useWebSocketResults hook
        console.log(`Received ${message.type} for conversation ${targetId}`);
        break;

      case 'audio_processed':
        console.log(`Audio ${message.payload.audioId} has been processed successfully`);
        break;

      case 'audio_failed':
        console.error(`Audio ${message.payload.audioId} processing failed: ${message.payload.error}`);
        break;

      // Handle other message types as needed
      default:
        console.log(`Received unhandled WebSocket message type: ${message.type}`);
    }
  }, []);

  // Pre-declare functions to avoid circular dependencies
  const storePendingMessage = useCallback(async (message: WebSocketMessage) => {}, []);
  const sendPendingMessages = useCallback(async () => {}, []);
  const scheduleReconnect = useCallback(() => {}, []);
  const reconnect = useCallback(() => {}, []);
  const initializeWebSocket = useCallback(async () => {}, []);

  /**
   * Initialize WebSocket connection with authentication
   */
  const initializeWebSocketImpl = useCallback(async () => {
    // Clear any existing reconnect timeouts
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    try {
      setConnectionState('connecting');
      
      // Get authentication token for the connection
      const token = await getFreshToken();
      
      // If token or URL haven't changed and we have an open connection, just reuse it
      if (
        globalWsInstance.instance && 
        globalWsInstance.url === wsUrl && 
        globalWsInstance.token === token &&
        globalWsInstance.instance.readyState === WebSocket.OPEN
      ) {
        console.log('Reusing existing WebSocket connection');
        setConnectionState('connected');
        
        // Resubscribe to topics
        localSubscriptions.current.forEach(topic => {
          globalWsInstance.subscriptions.add(topic);
          if (globalWsInstance.instance?.readyState === WebSocket.OPEN) {
            globalWsInstance.instance.send(JSON.stringify({
              type: 'subscribe',
              topic,
              payload: {}
            }));
          }
        });
        
        return;
      }

      // Close existing connection if any
      if (globalWsInstance.instance && globalWsInstance.instance.readyState !== WebSocket.CLOSED) {
        console.log('Closing existing WebSocket connection');
        globalWsInstance.instance.close(1000, 'New connection initiated');
        globalWsInstance.instance = null;
      }
      
      // Create new WebSocket connection without token in URL
      console.log('Connecting to WebSocket:', wsUrl);
      
      const wsInstance = new WebSocket(wsUrl);
      globalWsInstance.instance = wsInstance;
      globalWsInstance.url = wsUrl;
      globalWsInstance.token = token;
      
      // Setup event handlers
      wsInstance.onopen = () => {
        console.log('WebSocket connection established');
        
        // Send authentication message first
        wsInstance.send(JSON.stringify({
          type: 'authenticate',
          payload: { token }
        }));
        
        setConnectionState('connected');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
        
        // Send any pending messages from local storage
        sendPendingMessages();
        
        // Resubscribe to topics
        localSubscriptions.current.forEach(topic => {
          globalWsInstance.subscriptions.add(topic);
          wsInstance.send(JSON.stringify({
            type: 'subscribe',
            topic,
            payload: {}
          }));
        });
      };
      
      wsInstance.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
          
          console.log('WebSocket message received:', message.type);
          
          // Log subscription confirmations for debugging
          if (message.type === 'subscribed' && message.topic) {
            console.log(`Successfully subscribed to ${message.topic}`);
          }
          
          // Global handler for all incoming messages
          handleIncomingMessage(message);
          
          // Special case: token is about to expire or has expired
          if (message.type === 'auth_error') {
            console.log('Auth error from WebSocket, reconnecting with fresh token');
            reconnect();
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      wsInstance.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      wsInstance.onclose = (event) => {
        console.log(`WebSocket closed with code ${event.code}: ${event.reason}`);
        
        if (globalWsInstance.instance === wsInstance) {
          globalWsInstance.instance = null;
        }
        
        setConnectionState('disconnected');
        
        // Attempt reconnection unless explicitly closed by the client
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setConnectionState('failed');
      globalWsInstance.instance = null;
      scheduleReconnect();
    }
  }, [wsUrl, getFreshToken, setConnectionState, sendPendingMessages, handleIncomingMessage, reconnect, scheduleReconnect]);

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnectImpl = useCallback(() => {
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState('failed');
      return;
    }
    
    reconnectAttempts.current += 1;
    setConnectionState('reconnecting');
    
    // Calculate delay with exponential backoff
    const delay = getReconnectDelay();
    
    console.log(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
    
    reconnectTimeout.current = setTimeout(() => {
      initializeWebSocket();
    }, delay);
  }, [getReconnectDelay, initializeWebSocket, setConnectionState]);

  /**
   * Forcibly reconnect the WebSocket
   */
  const reconnectImpl = useCallback(() => {
    reconnectAttempts.current = 0; // Reset reconnect attempts for manual reconnection
    initializeWebSocket();
  }, [initializeWebSocket]);

  /**
   * Store a message in local storage for later transmission
   */
  const storePendingMessageImpl = useCallback(async (message: WebSocketMessage) => {
    try {
      const pendingMessagesString = await AsyncStorage.getItem('websocket_pending_messages');
      const pendingMessages = pendingMessagesString ? JSON.parse(pendingMessagesString) : [];
      
      pendingMessages.push({
        message,
        timestamp: Date.now(),
      });
      
      // Keep only the most recent 50 messages to prevent storage overflow
      const recentMessages = pendingMessages.slice(-50);
      
      await AsyncStorage.setItem('websocket_pending_messages', JSON.stringify(recentMessages));
    } catch (error) {
      console.error('Failed to store pending WebSocket message:', error);
    }
  }, []);

  /**
   * Send any pending messages stored in local storage
   */
  const sendPendingMessagesImpl = useCallback(async () => {
    if (!globalWsInstance.instance || globalWsInstance.instance.readyState !== WebSocket.OPEN) return;
    
    try {
      const pendingMessagesString = await AsyncStorage.getItem('websocket_pending_messages');
      if (!pendingMessagesString) return;
      
      const pendingMessages = JSON.parse(pendingMessagesString);
      console.log(`Sending ${pendingMessages.length} pending WebSocket messages`);
      
      // Send each pending message
      let successCount = 0;
      for (const item of pendingMessages) {
        try {
          globalWsInstance.instance.send(JSON.stringify(item.message));
          successCount++;
        } catch (err) {
          console.error('Failed to send pending message:', err);
        }
      }
      
      console.log(`Successfully sent ${successCount} of ${pendingMessages.length} pending messages`);
      
      // Clear pending messages
      await AsyncStorage.removeItem('websocket_pending_messages');
    } catch (error) {
      console.error('Failed to send pending WebSocket messages:', error);
    }
  }, []);

  // Update function implementations after all functions are defined
  // Object.assign(handleIncomingMessage, handleIncomingMessageImpl); // Already defined above
  Object.assign(storePendingMessage, storePendingMessageImpl);
  Object.assign(sendPendingMessages, sendPendingMessagesImpl);
  Object.assign(scheduleReconnect, scheduleReconnectImpl);
  Object.assign(reconnect, reconnectImpl);
  Object.assign(initializeWebSocket, initializeWebSocketImpl);

  /**
   * Subscribe to a conversation or other topic
   */
  const subscribe = useCallback((topicId: string) => {
    // Add to local subscriptions
    localSubscriptions.current.add(topicId);
    
    // Add to global subscriptions and send message if connected
    if (globalWsInstance.instance && globalWsInstance.instance.readyState === WebSocket.OPEN) {
      globalWsInstance.subscriptions.add(topicId);
      
      console.log(`Subscribing to topic: ${topicId}`);
      globalWsInstance.instance.send(JSON.stringify({
        type: 'subscribe',
        topic: topicId,
        payload: {}
      }));
    } else {
      // Store for when connection is established
      globalWsInstance.subscriptions.add(topicId);
      console.log(`Queuing subscription to ${topicId} for when connection is established`);
      
      // Try to connect if not connected
      if (!globalWsInstance.instance || globalWsInstance.instance.readyState !== WebSocket.CONNECTING) {
        initializeWebSocket();
      }
    }
  }, [initializeWebSocket]);

  /**
   * Unsubscribe from a topic
   */
  const unsubscribe = useCallback((topicId: string) => {
    // Remove from local subscriptions
    localSubscriptions.current.delete(topicId);
    
    // Send unsubscribe message if connected
    if (globalWsInstance.instance && globalWsInstance.instance.readyState === WebSocket.OPEN) {
      console.log(`Unsubscribing from topic: ${topicId}`);
      globalWsInstance.instance.send(JSON.stringify({
        type: 'unsubscribe',
        topic: topicId,
        payload: {}
      }));
    }
    
    // NOTE: We don't remove from global subscriptions here to allow other components to maintain their subscriptions
  }, []);

  /**
   * Check if already subscribed to a topic
   */
  const isSubscribed = useCallback((topicId: string) => {
    return localSubscriptions.current.has(topicId) || globalWsInstance.subscriptions.has(topicId);
  }, []);

  /**
   * Send a message through the WebSocket
   * Stores message in local storage if connection is not available
   */
  const sendMessage = useCallback((type: string, payload: any, topic?: string) => {
    const message: WebSocketMessage = { type, payload };
    if (topic) {
      message.topic = topic;
    }
    
    if (globalWsInstance.instance && globalWsInstance.instance.readyState === WebSocket.OPEN) {
      // Connection is open, send message directly
      globalWsInstance.instance.send(JSON.stringify(message));
    } else {
      // Store message for later transmission
      storePendingMessage(message);
      
      // Try to connect if not connected
      if (!globalWsInstance.instance || globalWsInstance.instance.readyState !== WebSocket.CONNECTING) {
        initializeWebSocket();
      }
    }
  }, [initializeWebSocket, storePendingMessage]);

  // Initialize WebSocket on mount and reconnect when URL or token changes
  useEffect(() => {
    initializeWebSocket();
    
    // Capture the subscriptions reference at effect execution time
    const subscriptionsRef = localSubscriptions.current;
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      // Use the captured reference from when the effect ran
      subscriptionsRef.clear();
    };
  }, [initializeWebSocket]);

  /**
   * Special processing for ping messages
   * Separated to avoid circular dependency
   */
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'ping') {
      // Respond to server pings to keep connection alive
      if (globalWsInstance.instance && globalWsInstance.instance.readyState === WebSocket.OPEN) {
        globalWsInstance.instance.send(JSON.stringify({
          type: 'pong',
          id: lastMessage.id,
          payload: {}
        }));
      }
    }
  }, [lastMessage]);

  return {
    connectionState,
    sendMessage,
    subscribe,
    unsubscribe,
    lastMessage,
    reconnect,
    isSubscribed,
  };
}

/**
 * WebSocket connection states
 */
export type WebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'disconnected'
  | 'error';

/**
 * WebSocket manager options
 */
interface WebSocketManagerOptions {
  url: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  pingInterval?: number;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  getAuthToken?: () => Promise<string | null>;
  debug?: boolean;
}

/**
 * WebSocket manager class
 * 
 * Handles WebSocket connections with proper message validation,
 * reconnection logic, and message processing.
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private options: WebSocketManagerOptions;
  private connectionState: WebSocketConnectionState = 'disconnected';
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastMessageTime: number = 0;
  private messageHandlers: Map<WebSocketMessageType, Set<(message: WebSocketMessage) => void>> = new Map();
  private pendingMessages: WebSocketMessage[] = [];
  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;
  private lastNetworkStatus: boolean = true;
  private subscriptions: Set<string> = new Set();

  /**
   * Creates a new WebSocket manager
   * @param options WebSocket manager options
   */
  constructor(options: WebSocketManagerOptions) {
    this.url = options.url;
    this.options = {
      autoReconnect: true,
      reconnectDelay: WS_RECONNECT_DELAY,
      pingInterval: WS_PING_INTERVAL,
      debug: false,
      ...options
    };

    // Load any pending messages from storage
    this.loadPendingMessages().catch(err => {
      console.error('[WebSocketManager] Failed to load pending messages:', err);
    });

    // Initial connection attempt
    this.connect();
  }

  /**
   * Connects to the WebSocket server
   */
  public connect(): void {
    // Don't connect if already connecting/connected or reconnecting
    if (
      this.ws && 
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) || 
      this.isReconnecting
    ) {
      return;
    }

    this.connectionState = 'connecting';
    
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      this.log('Connecting to WebSocket server:', this.url);
      this.ws = new WebSocket(this.url);
      
      // Set up WebSocket event handlers
      this.ws.onopen = this.handleOpen;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      this.ws.onmessage = this.handleMessage;
      
      // Reset reconnect attempts if successful
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
    } catch (error) {
      this.log('Error creating WebSocket connection:', error);
      this.connectionState = 'error';
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnects from the WebSocket server
   */
  public disconnect(): void {
    this.log('Disconnecting from WebSocket server');
    
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
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      this.ws.close();
    }
    
    this.connectionState = 'disconnected';
    this.ws = null;
  }

  /**
   * Sends a message to the WebSocket server
   * @param message Message to send
   * @returns Promise that resolves when the message is sent
   */
  public send(message: WebSocketMessage): Promise<void> {
    // Add timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }
    
    // Add ID if not provided (for tracking)
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    return new Promise<void>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log('WebSocket not connected, queuing message:', message);
        this.pendingMessages.push(message);
        this.savePendingMessages();
        
        // If not connected and not reconnecting, try to reconnect
        if (this.connectionState === 'disconnected' && !this.isReconnecting) {
          this.connect();
        }
        
        // Resolve anyway, as the message will be sent when reconnected
        resolve();
        return;
      }
      
      try {
        const messageString = JSON.stringify(message);
        this.ws.send(messageString);
        this.log('Sent message:', message);
        resolve();
      } catch (error) {
        this.log('Error sending message:', error);
        
        // Queue the message for later
        this.pendingMessages.push(message);
        this.savePendingMessages();
        
        reject(error);
      }
    });
  }

  /**
   * Subscribes to a topic
   * @param topic Topic to subscribe to
   */
  public subscribe(topic: string): Promise<void> {
    this.subscriptions.add(topic);
    
    // If connected and authenticated, send subscription immediately
    if (this.connectionState === 'authenticated') {
      return this.send({
        type: 'subscribe',
        topic,
        payload: {}
      });
    }
    
    // If not authenticated, it will be sent after authentication
    return Promise.resolve();
  }

  /**
   * Unsubscribes from a topic
   * @param topic Topic to unsubscribe from
   */
  public unsubscribe(topic: string): Promise<void> {
    this.subscriptions.delete(topic);
    
    // Only send if connected and authenticated
    if (this.connectionState === 'authenticated') {
      return this.send({
        type: 'unsubscribe',
        topic,
        payload: {}
      });
    }
    
    return Promise.resolve();
  }

  /**
   * Registers a message handler for a specific message type
   * @param type Message type to handle
   * @param handler Handler function
   */
  public on(type: string, handler: (message: WebSocketMessage) => void): void {
    if (!this.messageHandlers.has(type as WebSocketMessageType)) {
      this.messageHandlers.set(type as WebSocketMessageType, new Set());
    }
    
    this.messageHandlers.get(type as WebSocketMessageType)!.add(handler);
  }

  /**
   * Removes a message handler for a specific message type
   * @param type Message type
   * @param handler Handler function to remove
   */
  public off(type: string, handler: (message: WebSocketMessage) => void): void {
    if (this.messageHandlers.has(type as WebSocketMessageType)) {
      this.messageHandlers.get(type as WebSocketMessageType)!.delete(handler);
    }
  }

  /**
   * Handles WebSocket open event
   */
  private handleOpen = async (event: Event): Promise<void> => {
    this.log('WebSocket connection opened');
    this.connectionState = 'connected';
    this.lastMessageTime = Date.now();
    
    // Start ping interval
    this.startPingInterval();
    
    // Authenticate if getAuthToken is provided
    if (this.options.getAuthToken) {
      const token = await this.options.getAuthToken();
      if (token) {
        this.send({
          type: 'authenticate',
          payload: { token }
        });
      } else {
        this.log('No auth token available');
      }
    }
    
    // Invoke onOpen callback if provided
    if (this.options.onOpen) {
      this.options.onOpen(event);
    }
  };

  /**
   * Handles WebSocket close event
   */
  private handleClose = (event: CloseEvent): void => {
    this.log('WebSocket connection closed:', event.code, event.reason);
    this.connectionState = 'disconnected';
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Schedule reconnect if enabled
    if (this.options.autoReconnect) {
      this.scheduleReconnect();
    }
    
    // Invoke onClose callback if provided
    if (this.options.onClose) {
      this.options.onClose(event);
    }
  };

  /**
   * Handles WebSocket error event
   */
  private handleError = (event: Event): void => {
    this.log('WebSocket error:', event);
    this.connectionState = 'error';
    
    // Invoke onError callback if provided
    if (this.options.onError) {
      this.options.onError(event);
    }
    
    // Don't need to schedule reconnect here as the close handler will be called
  };

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage = (event: MessageEvent): void => {
    this.lastMessageTime = Date.now();
    
    // Parse the message
    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      this.log('Error parsing WebSocket message:', error, event.data);
      return;
    }
    
    // Validate the message type
    if (!isWebSocketMessage(message)) {
      if (typeof message === 'object' && message !== null && 'type' in message) {
        this.log(`Received unknown WebSocket message type: ${message.type}`, message);
      } else {
        this.log('Received invalid WebSocket message:', message);
      }
      return;
    }

    this.log('Received WebSocket message:', message);
    
    // Handle authentication success
    if (message.type === 'authentication_success') {
      this.log('Authentication successful');
      this.connectionState = 'authenticated';
      
      // Resubscribe to all topics
      for (const topic of this.subscriptions) {
        this.send({
          type: 'subscribe',
          topic,
          payload: {}
        }).catch(err => {
          this.log(`Error resubscribing to ${topic}:`, err);
        });
      }
      
      // Send any pending messages
      this.sendPendingMessages();
    }
    
    // Handle pings with pongs
    if (message.type === 'ping') {
      this.send({
        type: 'pong',
        id: message.id, // Echo back the same ID
        payload: {}
      }).catch(err => {
        this.log('Error sending pong:', err);
      });
    }
    
    // Invoke message-specific handlers
    const handlers = this.messageHandlers.get(message.type as WebSocketMessageType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (error) {
          this.log(`Error in handler for ${message.type}:`, error);
        }
      }
    }
    
    // Invoke general message handler if provided
    if (this.options.onMessage) {
      try {
        this.options.onMessage(message);
      } catch (error) {
        this.log('Error in onMessage handler:', error);
      }
    }
  };

  /**
   * Schedules a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isReconnecting) {
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const delay = Math.min(
      30000, // max 30 seconds
      this.options.reconnectDelay! * Math.pow(1.5, this.reconnectAttempts - 1)
    ) * (0.9 + Math.random() * 0.2); // Add 10% jitter
    
    this.log(`Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  /**
   * Starts the ping interval to keep the connection alive
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
        this.log(`No message received for ${elapsed}ms, reconnecting...`);
        this.disconnect();
        this.connect();
        return;
      }
      
      // Send ping if connected
      if (this.connectionState === 'connected' || this.connectionState === 'authenticated') {
        this.send({
          type: 'ping',
          payload: {}
        }).catch(err => {
          this.log('Error sending ping:', err);
        });
      }
    }, this.options.pingInterval!);
  }

  /**
   * Sends all pending messages
   */
  private sendPendingMessages(): void {
    if (this.pendingMessages.length === 0 || this.connectionState !== 'authenticated') {
      return;
    }
    
    this.log(`Sending ${this.pendingMessages.length} pending messages`);
    
    // Clone and clear the queue to avoid potential race conditions
    const messagesToSend = [...this.pendingMessages];
    this.pendingMessages = [];
    
    // Send each message
    for (const message of messagesToSend) {
      this.send(message).catch(err => {
        this.log(`Error sending pending message:`, err);
        // If we fail to send, it will be re-added to the queue
      });
    }
    
    // Update stored pending messages
    this.savePendingMessages();
  }

  /**
   * Saves pending messages to AsyncStorage
   */
  private async savePendingMessages(): Promise<void> {
    try {
      // Only save messages that are worth retrying (e.g., not pings/pongs)
      const messagesToSave = this.pendingMessages.filter(msg => 
        msg.type !== 'ping' && 
        msg.type !== 'pong' &&
        msg.type !== 'authenticate'
      );
      
      if (messagesToSave.length > 0) {
        await AsyncStorage.setItem(
          WS_PENDING_MESSAGES_KEY, 
          JSON.stringify(messagesToSave)
        );
      } else {
        await AsyncStorage.removeItem(WS_PENDING_MESSAGES_KEY);
      }
    } catch (error) {
      this.log('Error saving pending messages:', error);
    }
  }

  /**
   * Loads pending messages from AsyncStorage
   */
  private async loadPendingMessages(): Promise<void> {
    try {
      const messagesJson = await AsyncStorage.getItem(WS_PENDING_MESSAGES_KEY);
      if (messagesJson) {
        const messages = JSON.parse(messagesJson);
        if (Array.isArray(messages)) {
          // Only keep valid messages
          this.pendingMessages = messages.filter(isWebSocketMessage);
          this.log(`Loaded ${this.pendingMessages.length} pending messages`);
        }
      }
    } catch (error) {
      this.log('Error loading pending messages:', error);
    }
  }

  /**
   * Logs a message if debug is enabled
   * @param message Message to log
   * @param args Additional arguments
   */
  private log(message: string, ...args: any[]): void {
    if (this.options.debug) {
      console.log(`[WebSocketManager] ${message}`, ...args);
    }
  }

  /**
   * Gets the current connection state
   */
  public getConnectionState(): WebSocketConnectionState {
    return this.connectionState;
  }

  /**
   * Checks if the connection is authenticated
   */
  public isAuthenticated(): boolean {
    return this.connectionState === 'authenticated';
  }

  /**
   * Updates the network status and reconnects if needed
   * @param isConnected Whether the device is connected to the network
   */
  public updateNetworkStatus(isConnected: boolean): void {
    // If we previously had no connection but now we do, reconnect
    if (!this.lastNetworkStatus && isConnected && 
        (this.connectionState === 'disconnected' || this.connectionState === 'error')) {
      this.log('Network connection restored, reconnecting...');
      this.connect();
    }
    
    this.lastNetworkStatus = isConnected;
  }
}

/**
 * React hook for using WebSocketManager
 * @param url WebSocket URL
 * @param options WebSocketManager options
 */
export const useWebSocket = (
  url: string,
  options: Omit<WebSocketManagerOptions, 'url'> = {}
) => {
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const wsManagerRef = useRef<WebSocketManager | null>(null);
  
  // Create WebSocket manager instance if it doesn't exist
  useEffect(() => {
    const manager = new WebSocketManager({
      ...options,
      url,
      onOpen: (event) => {
        setConnectionState('connected');
        options.onOpen?.(event);
      },
      onClose: (event) => {
        setConnectionState('disconnected');
        options.onClose?.(event);
      },
      onError: (event) => {
        setConnectionState('error');
        options.onError?.(event);
      },
      onMessage: (message) => {
        if (message.type === 'authentication_success') {
          setConnectionState('authenticated');
        } else if (message.type === 'authentication_failed' || message.type === 'auth_error') {
          setConnectionState('disconnected');
        }
        
        options.onMessage?.(message);
      }
    });
    
    wsManagerRef.current = manager;
    
    // Monitor app state for background/foreground transitions
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && manager.getConnectionState() === 'disconnected') {
        // App came back to foreground, reconnect if needed
        manager.connect();
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Monitor network connectivity
    const monitorNetworkConnectivity = async () => {
      try {
        const status = await Network.getNetworkStateAsync();
        manager.updateNetworkStatus(status.isConnected ?? false);
        
        // Set up periodic network status check
        const interval = setInterval(async () => {
          try {
            const currentStatus = await Network.getNetworkStateAsync();
            manager.updateNetworkStatus(currentStatus.isConnected ?? false);
          } catch (error) {
            console.error('[useWebSocket] Error checking network status:', error);
          }
        }, 10000); // Check every 10 seconds
        
        return () => clearInterval(interval);
      } catch (error) {
        console.error('[useWebSocket] Error monitoring network connectivity:', error);
      }
    };
    
    const cleanup = monitorNetworkConnectivity();
    
    // Cleanup function
    return () => {
      subscription.remove();
      cleanup.then(cleanupFn => cleanupFn?.());
      
      if (wsManagerRef.current) {
        wsManagerRef.current.disconnect();
        wsManagerRef.current = null;
      }
    };
  }, [options, url]);
  
  // Define helper functions for the hook consumers
  const send = useCallback((message: WebSocketMessage) => {
    if (wsManagerRef.current) {
      return wsManagerRef.current.send(message);
    }
    return Promise.reject(new Error('WebSocket not initialized'));
  }, []);
  
  const subscribe = useCallback((topic: string) => {
    if (wsManagerRef.current) {
      return wsManagerRef.current.subscribe(topic);
    }
    return Promise.reject(new Error('WebSocket not initialized'));
  }, []);
  
  const unsubscribe = useCallback((topic: string) => {
    if (wsManagerRef.current) {
      return wsManagerRef.current.unsubscribe(topic);
    }
    return Promise.reject(new Error('WebSocket not initialized'));
  }, []);
  
  const on = useCallback((type: string, handler: (message: WebSocketMessage) => void) => {
    if (wsManagerRef.current) {
      wsManagerRef.current.on(type, handler);
    }
  }, []);
  
  const off = useCallback((type: string, handler: (message: WebSocketMessage) => void) => {
    if (wsManagerRef.current) {
      wsManagerRef.current.off(type, handler);
    }
  }, []);
  
  const reconnect = useCallback(() => {
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
      wsManagerRef.current.connect();
    }
  }, []);
  
  return {
    connectionState,
    send,
    subscribe,
    unsubscribe,
    on,
    off,
    reconnect,
    isAuthenticated: connectionState === 'authenticated'
  };
};

/**
 * Type guard for WebSocketMessage
 */
function isWebSocketMessage(message: any): message is WebSocketMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof message.type === 'string' &&
    'payload' in message
  );
} 