/**
 * WebSocket Manager for handling real-time communication
 * Replaces polling with an efficient WebSocket connection
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Constants
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 8; // Max number of reconnection attempts
const MAX_RECONNECT_DELAY = 30000; // Max delay between reconnections (30 seconds)
const DEFAULT_WS_URL = Constants.expoConfig?.extra?.apiUrl || 'https://api.vibecheck.app';

// Connection state type
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

// WebSocket event types
export interface WebSocketMessage {
  type: string;
  payload: any;
  topic?: string;
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
  const { getAuthToken } = useAuthToken();
  const wsUrl = wsUrlOverride || getWebSocketUrl();
  
  const reconnectAttempts = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => 
    globalWsInstance.instance ? 
      (globalWsInstance.instance.readyState === WebSocket.OPEN ? 'connected' : 'connecting') : 
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
   * Initialize WebSocket connection with authentication
   */
  const initializeWebSocket = useCallback(async () => {
    // Clear any existing reconnect timeouts
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    try {
      setConnectionState('connecting');
      
      // Get authentication token for the connection
      const token = await getAuthToken();
      
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
              topic
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
      
      // Create WebSocket with token in the URL
      const connectionUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
      console.log('Connecting to WebSocket:', connectionUrl);
      
      const wsInstance = new WebSocket(connectionUrl);
      globalWsInstance.instance = wsInstance;
      globalWsInstance.url = wsUrl;
      globalWsInstance.token = token;
      
      // Setup event handlers
      wsInstance.onopen = () => {
        console.log('WebSocket connection established');
        setConnectionState('connected');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
        
        // Send any pending messages from local storage
        sendPendingMessages();
        
        // Resubscribe to topics
        localSubscriptions.current.forEach(topic => {
          globalWsInstance.subscriptions.add(topic);
          wsInstance.send(JSON.stringify({
            type: 'subscribe',
            topic
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
  }, [wsUrl, getAuthToken]);

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
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
  }, [getReconnectDelay, initializeWebSocket]);

  /**
   * Forcibly reconnect the WebSocket
   */
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0; // Reset reconnect attempts for manual reconnection
    initializeWebSocket();
  }, [initializeWebSocket]);

  /**
   * Process different types of incoming messages
   */
  const handleIncomingMessage = useCallback((message: WebSocketMessage) => {
    // Let the component handle most message types through the lastMessage state
    
    // Special handling for ping messages
    if (message.type === 'ping') {
      // Respond to server pings to keep connection alive
      sendMessage('pong', {});
    }
  }, []);

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
        topic: topicId
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
        topic: topicId
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
  }, [initializeWebSocket]);

  /**
   * Store a message in local storage for later transmission
   */
  const storePendingMessage = useCallback(async (message: WebSocketMessage) => {
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
  const sendPendingMessages = useCallback(async () => {
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

  // Initialize WebSocket on mount and reconnect when URL or token changes
  useEffect(() => {
    initializeWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      // Clear local subscriptions but keep the connection for other components
      localSubscriptions.current.clear();
    };
  }, [wsUrl, initializeWebSocket]);

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