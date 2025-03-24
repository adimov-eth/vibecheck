import { networkService } from "@/services/NetworkService";
import { webSocketService, type WebSocketMessage, type WebSocketMessageType } from "@/services/WebSocketService";
import { handleError } from "@/utils/errorUtils";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WebSocket connection state
 */
export interface WebSocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
}

/**
 * Hook for using WebSocket with automatic network reconnection
 */
export function useWebSocketWithNetwork(options: {
  autoConnect?: boolean;
  subscribeToTopics?: string[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onAuthChange?: (isAuthenticated: boolean) => void;
} = {}) {
  const {
    autoConnect = true,
    subscribeToTopics = [],
    onConnect,
    onDisconnect,
    onAuthChange,
  } = options;
  
  const { isSignedIn } = useAuth();
  
  const [connectionState, setConnectionState] = useState<WebSocketState>({
    isConnected: webSocketService.isConnected(),
    isAuthenticated: webSocketService.isAuthenticated(),
  });
  
  // Track whether the component is mounted to avoid updating state after unmount
  const isMountedRef = useRef(true);
  
  // Track subscribed topics to avoid duplicate subscriptions
  const subscribedTopicsRef = useRef<Set<string>>(new Set());
  
  // Track connection/reconnection attempts
  const connectionAttemptsRef = useRef(0);
  const maxReconnectAttemptsRef = useRef(5);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isSignedIn) {
      console.log("Not connecting WebSocket - user not signed in");
      return;
    }

    if (!connectionState.isConnected) {
      // Initialize WebSocket service if needed
      webSocketService.init();
      webSocketService.connect();
      connectionAttemptsRef.current++;
    }
  }, [connectionState.isConnected, isSignedIn]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    webSocketService.disconnect();
    subscribedTopicsRef.current.clear();
  }, []);
  
  // Subscribe to a topic
  const subscribe = useCallback((topic: string) => {
    if (!subscribedTopicsRef.current.has(topic)) {
      webSocketService.subscribe(topic);
      subscribedTopicsRef.current.add(topic);
    }
    
    return () => {
      webSocketService.unsubscribe(topic);
      subscribedTopicsRef.current.delete(topic);
    };
  }, []);
  
  // Send a message
  const send = useCallback(
    (type: WebSocketMessageType, payload: Record<string, unknown>, topic?: string) => {
      if (!isSignedIn) {
        console.warn("Cannot send WebSocket message when not signed in");
        return false;
      }

      try {
        webSocketService.send({ type, payload, topic });
        return true;
      } catch (error) {
        handleError(error, {
          defaultMessage: "Failed to send WebSocket message",
          serviceName: "WebSocket",
          showToast: false,
        });
        return false;
      }
    },
    [isSignedIn]
  );
  
  // Listen for connection state changes
  useEffect(() => {
    if (!isSignedIn) {
      // Disconnect if user is not signed in
      disconnect();
      setConnectionState({
        isConnected: false,
        isAuthenticated: false,
      });
      return;
    }

    const unsubscribe = webSocketService.addListener((state) => {
      if (!isMountedRef.current) return;
      
      const wasConnected = connectionState.isConnected;
      const wasAuthenticated = connectionState.isAuthenticated;
      const isNowConnected = state.connected;
      const isNowAuthenticated = state.authenticated;
      
      setConnectionState({
        isConnected: isNowConnected,
        isAuthenticated: isNowAuthenticated,
      });
      
      // Reset connection attempts if connected successfully
      if (isNowConnected && !wasConnected) {
        connectionAttemptsRef.current = 0;
      }
      
      // Call appropriate callbacks
      if (isNowConnected && !wasConnected && onConnect) {
        onConnect();
      } else if (!isNowConnected && wasConnected && onDisconnect) {
        onDisconnect();
      }
      
      // Call auth change callback
      if (isNowAuthenticated !== wasAuthenticated && onAuthChange) {
        onAuthChange(isNowAuthenticated);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [connectionState.isConnected, connectionState.isAuthenticated, onConnect, onDisconnect, onAuthChange, isSignedIn, disconnect]);
  
  // Auto-connect on mount if specified
  useEffect(() => {
    if (autoConnect && isSignedIn) {
      connect();
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [autoConnect, connect, isSignedIn]);
  
  // Add automatic reconnection on network status change
  useEffect(() => {
    const unsubscribe = networkService.addListener((status) => {
      if (!isMountedRef.current || !isSignedIn) return;
      
      if (status.isConnected && status.isInternetReachable) {
        // Only attempt reconnect if under max attempts or if network was previously down
        if (!webSocketService.isConnected() && 
            (connectionAttemptsRef.current < maxReconnectAttemptsRef.current)) {
          console.log("Network restored, reconnecting WebSocket");
          connect();
        }
      }
    });
    
    return unsubscribe;
  }, [connect, isSignedIn]);
  
  // Subscribe to initial topics
  useEffect(() => {
    if (!connectionState.isAuthenticated) return;
    
    const unsubscribers = subscribeToTopics
      .filter(topic => !subscribedTopicsRef.current.has(topic))
      .map(topic => {
        subscribedTopicsRef.current.add(topic);
        webSocketService.subscribe(topic);
        return topic;
      });
    
    // Return cleanup function
    return () => {
      unsubscribers.forEach(topic => {
        webSocketService.unsubscribe(topic);
        subscribedTopicsRef.current.delete(topic);
      });
    };
  }, [connectionState.isAuthenticated, subscribe, subscribeToTopics]);
  
  return {
    ...connectionState,
    connect,
    disconnect,
    subscribe,
    send,
    connectionAttempts: connectionAttemptsRef.current,
  };
}

/**
 * Hook for subscribing to WebSocket messages by type - with automatic reconnection
 * @param type Message type to subscribe to
 * @param handler Message handler function
 * @param dependencies Optional dependencies for handler
 */
export function useWebSocketMessageWithNetwork(
  type: WebSocketMessageType,
  handler: (message: WebSocketMessage) => void,
  dependencies: React.DependencyList = []
) {
  // Use the network-aware WebSocket hook
  const { isConnected } = useWebSocketWithNetwork();
  
  // Register message handler
  useEffect(() => {
    // Only register if connected
    if (!isConnected) return undefined;
    
    const unsubscribe = webSocketService.onMessage(type, handler);
    return unsubscribe;
  }, [type, handler, isConnected, ...dependencies]);
  
  return { isConnected };
}