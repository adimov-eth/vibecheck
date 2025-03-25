// hooks/useWebSocket.ts
import { useEffect } from 'react';
import useStore from '../state/index';

export const useWebSocket = () => {
  const { socket, wsMessages, connectWebSocket, subscribeToConversation, clearMessages } =
    useStore();

  useEffect(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connectWebSocket().catch((err) => {
        console.error('WebSocket connection failed:', err);
      });
    }
  }, [socket, connectWebSocket]);

  return { socket, messages: wsMessages, subscribeToConversation, clearMessages };
};