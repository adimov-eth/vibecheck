/**
 * WebSocket Manager for handling real-time communication
 * Replaces polling with an efficient WebSocket connection
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 8; // Max number of reconnection attempts
const MAX_RECONNECT_DELAY = 30000; // Max delay between reconnections (30 seconds)

// Connection state type
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

// WebSocket event types
interface WebSocketMessage {
  type: string;
  payload: any;
}

// Define the WebSocketManager hook return type
interface WebSocketManagerHook {
  connectionState: ConnectionState;
  sendMessage: (type: string, payload: any) => void;
  lastMessage: WebSocketMessage | null;
  reconnect: () => void;
}

/**
 * Custom hook for managing WebSocket connections
 * Handles authentication, reconnection, and message processing
 * 
 * @param url - The WebSocket server URL
 * @returns WebSocketManager interface with connection state and methods
 */
export function useWebSocketManager(url: string): WebSocketManagerHook {
  const { getFreshToken } = useAuthToken();
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

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

    // Close existing connection if any
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    try {
      setConnectionState('connecting');
      
      // Get authentication token for the connection
      const token = await getFreshToken();
      
      // Create WebSocket with token in the URL
      const connectionUrl = `${url}?token=${token}`;
      ws.current = new WebSocket(connectionUrl);
      
      // Setup event handlers
      ws.current.onopen = () => {
        setConnectionState('connected');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
        
        // Send any pending messages from local storage
        sendPendingMessages();
      };
      
      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
          
          // Process different message types
          handleIncomingMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      ws.current.onclose = (event) => {
        console.log(`WebSocket closed with code ${event.code}`);
        setConnectionState('disconnected');
        
        // Attempt reconnection unless explicitly closed by the client
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setConnectionState('failed');
      scheduleReconnect();
    }
  }, [url, getFreshToken]);

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
    switch (message.type) {
      case 'conversation_update':
        // Handle conversation updates
        // This would replace the polling mechanism
        break;
      case 'notification':
        // Handle notifications
        break;
      case 'ping':
        // Respond to server pings to keep connection alive
        sendMessage('pong', {});
        break;
      default:
        // Handle other message types
        break;
    }
  }, []);

  /**
   * Send a message through the WebSocket
   * Stores message in local storage if connection is not available
   */
  const sendMessage = useCallback((type: string, payload: any) => {
    const message: WebSocketMessage = { type, payload };
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Connection is open, send message directly
      ws.current.send(JSON.stringify(message));
    } else {
      // Store message for later transmission
      storePendingMessage(message);
    }
  }, []);

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
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    
    try {
      const pendingMessagesString = await AsyncStorage.getItem('websocket_pending_messages');
      if (!pendingMessagesString) return;
      
      const pendingMessages = JSON.parse(pendingMessagesString);
      
      // Send each pending message
      for (const item of pendingMessages) {
        ws.current.send(JSON.stringify(item.message));
      }
      
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
      
      if (ws.current) {
        // Use code 1000 (Normal Closure) to indicate intentional closure
        ws.current.close(1000, 'Component unmounted');
      }
    };
  }, [url, initializeWebSocket]);

  return {
    connectionState,
    sendMessage,
    lastMessage,
    reconnect,
  };
} 