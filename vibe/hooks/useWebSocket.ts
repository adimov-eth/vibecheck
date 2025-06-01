// hooks/useWebSocket.ts
import { useEffect } from 'react';
import useStore from '../state/index';

export const useWebSocket = () => {
  console.log('[useWebSocket Hook] Initializing hook...');
  const { socket, wsMessages, connectWebSocket, subscribeToConversation, clearMessages } =
    useStore();

  useEffect(() => {
    console.log('[useWebSocket Hook] useEffect running. Checking socket state...');
    const socketState = socket ? socket.readyState : 'null';
    console.log(`[useWebSocket Hook] Current socket state: ${socketState}`);
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      console.log('[useWebSocket Hook] Socket is null or closed. Calling connectWebSocket().');
      connectWebSocket().catch((err) => {
        console.error('[useWebSocket Hook] connectWebSocket() call failed:', err);
      });
    }
  }, [socket, connectWebSocket]);

  return { socket, messages: wsMessages, subscribeToConversation, clearMessages };
};