// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import useStore from '../state/index';

export const useWebSocket = () => {
  console.log('[useWebSocket Hook] Initializing hook...');
  const { socket, wsMessages, connectWebSocket, subscribeToConversation, clearMessages, disconnectWebSocket } =
    useStore();
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const connectionAttemptRef = useRef<Promise<void> | null>(null);

  // Create stable callback to avoid re-triggering useEffect
  const handleConnect = useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }

    console.log('[useWebSocket Hook] useEffect running. Checking socket state...');
    const socketState = socket ? socket.readyState : 'null';
    console.log(`[useWebSocket Hook] Current socket state: ${socketState}`);
    
    // Prevent multiple simultaneous connection attempts
    if (connectionAttemptRef.current) {
      console.log('[useWebSocket Hook] Connection attempt already in progress, waiting...');
      await connectionAttemptRef.current;
      return;
    }
    
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      console.log('[useWebSocket Hook] Socket is null or closed. Calling connectWebSocket().');
      
      try {
        connectionAttemptRef.current = connectWebSocket();
        await connectionAttemptRef.current;
      } catch (err) {
        console.error('[useWebSocket Hook] connectWebSocket() call failed:', err);
      } finally {
        connectionAttemptRef.current = null;
      }
    }
  }, [socket, connectWebSocket]);

  useEffect(() => {
    isMountedRef.current = true;
    handleConnect();
    
    return () => {
      console.log('[useWebSocket Hook] Cleanup - component unmounting');
      isMountedRef.current = false;
      connectionAttemptRef.current = null;
    };
  }, [handleConnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useWebSocket Hook] Final cleanup on unmount');
      // Don't disconnect here as other components might still need the connection
      // Just ensure we clean up our local references
      isMountedRef.current = false;
    };
  }, []);

  return { 
    socket, 
    messages: wsMessages, 
    subscribeToConversation, 
    clearMessages,
    disconnect: disconnectWebSocket 
  };
};