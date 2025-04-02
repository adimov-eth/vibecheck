// state/slices/websocketSlice.ts
import { getClerkInstance } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StateCreator } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { StoreState, WS_URL, WebSocketMessage } from '../types';
interface WebSocketState {
  socket: WebSocket | null;
  wsMessages: WebSocketMessage[];
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  maxReconnectDelay: number;
  isConnecting: boolean;
}

interface WebSocketActions {
  calculateBackoff: () => number;
  connectWebSocket: () => Promise<void>;
  subscribeToConversation: (conversationId: string) => Promise<void>;
  unsubscribeFromConversation: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
}

export type WebSocketSlice = WebSocketState & WebSocketActions;

const initialState: WebSocketState = {
  socket: null,
  wsMessages: [],
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectInterval: 1000,
  maxReconnectDelay: 30000,
  isConnecting: false,
};

export const createWebSocketSlice: StateCreator<
  StoreState,
  [],
  [['zustand/immer', never]],
  WebSocketSlice
> = immer((set, get) => ({
  ...initialState,

  calculateBackoff: () => {
    const state = get();
    const exponentialDelay = Math.min(
      Math.pow(2, state.reconnectAttempts) * state.reconnectInterval,
      state.maxReconnectDelay
    );
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    return Math.floor(exponentialDelay + jitter);
  },

  connectWebSocket: async () => {
    const state = get();
    if (state.isConnecting || state.socket?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket connection already in progress');
      return;
    }

    // Remove the hard limit on reconnection attempts to ensure persistent connectivity
    // Instead, continue reconnecting but with increasing delays
    if (state.reconnectAttempts >= state.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached, but will keep trying with longer delays');
      // We'll continue, but don't reset the counter to maintain long delays
    }

    set((state) => {
      state.isConnecting = true;
    });

    try {
      const clerk = getClerkInstance();
      const session = await clerk.session;
      
      if (!session) {
        console.error('No active session available');
        set((state) => {
          state.isConnecting = false;
        });
        
        // Schedule a retry even if there's no session
        const backoffDelay = get().calculateBackoff();
        setTimeout(() => {
          set((state) => {
            state.reconnectAttempts += 1;
          });
          get().connectWebSocket();
        }, backoffDelay);
        return;
      }

      // Get a fresh token and handle token expiration
      let token: string | null;
      try {
        token = await session.getToken({
          template: 'uspeh',
          skipCache: true  // Always get a fresh token
        });

        if (!token) {
          throw new Error('Token is null after getToken');
        }
      } catch (tokenError) {
        console.error('Failed to get fresh token:', tokenError);
        // Attempt to refresh the session
        try {
          // Refresh the session using Clerk instance
          const newSession = await clerk.session;
          if (!newSession) {
            throw new Error('No session after refresh attempt');
          }
          
          token = await newSession.getToken({
            template: 'uspeh',
            skipCache: true
          });

          if (!token) {
            throw new Error('Token is null after refresh');
          }
        } catch (refreshError) {
          console.error('Failed to refresh session:', refreshError);
          set((state) => {
            state.isConnecting = false;
          });
          
          // Schedule a retry even if token refresh failed
          const backoffDelay = get().calculateBackoff();
          setTimeout(() => {
            set((state) => {
              state.reconnectAttempts += 1;
            });
            get().connectWebSocket();
          }, backoffDelay);
          return;
        }
      }

      // Clean up any existing socket before creating a new one
      const existingSocket = state.socket;
      if (existingSocket && existingSocket.readyState !== WebSocket.CLOSED) {
        existingSocket.close();
        set((state) => {
          state.socket = null;
        });
      }

      const wsUrl = new URL(WS_URL);
      wsUrl.searchParams.append('token', encodeURIComponent(token));
      wsUrl.searchParams.append('version', 'v1');
      const connectionUrl = wsUrl.toString();
      
      // Only log the URL structure in development, not the actual token
      console.log('Connecting WebSocket to:', wsUrl.origin + wsUrl.pathname);
      
      const ws = new WebSocket(connectionUrl);

      // Increase timeout from 10s to 15s for more reliable connections on slower networks
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('WebSocket connection timeout');
          ws.close();
        }
      }, 15000);

      ws.onopen = async () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket Connected');
        
        set((state) => {
          state.reconnectAttempts = 0; // Reset counter on successful connection
          state.isConnecting = false;
          state.socket = ws;
        });

        // Re-subscribe to any existing subscriptions from AsyncStorage
        try {
          const storedTopics = await AsyncStorage.getItem('websocket_subscriptions');
          if (storedTopics) {
            const topics = JSON.parse(storedTopics) as string[];
            topics.forEach(topic => {
              const conversationId = topic.split(':')[1];
              if (conversationId) {
                get().subscribeToConversation(conversationId);
              }
            });
            if (__DEV__) {
              console.log('Restored subscriptions after reconnect:', topics);
            }
          }
        } catch (e: unknown) {
          console.error('Error restoring subscriptions:', e instanceof Error ? e.message : e);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          
          // Only log in development environments
          if (__DEV__) {
            console.log('WebSocket message received:', message.type);
            if (message.type === 'subscription_confirmed') {
              console.log('Subscription confirmed with buffer status:', message.payload);
            }
          }
          
          set((state) => {
            // Keep up to 100 messages, prioritizing messages with conversation payloads
            const keepMessages = state.wsMessages
              .filter((msg: WebSocketMessage) => {
                // Keep all non-control messages for the current session
                if (msg.type === 'status' || 
                    msg.type === 'transcript' || 
                    msg.type === 'analysis' || 
                    msg.type === 'error') {
                  return true;
                }
                // Filter out control messages older than 5 minutes
                if (msg.timestamp) {
                  const msgTime = new Date(msg.timestamp).getTime();
                  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                  return msgTime > fiveMinutesAgo;
                }
                return false;
              })
              .slice(-90);
            
            state.wsMessages = [...keepMessages, message];
          });
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`WebSocket Closed: ${event.code} - ${event.reason}`);
        
        set((state) => {
          state.socket = null;
          state.isConnecting = false;
        });

        // Always attempt to reconnect unless it was a normal closure or auth error
        if (event.code !== 1000 && event.code !== 1008) { // 1008 is policy violation (often auth)
          const backoffDelay = get().calculateBackoff();
          console.log(
            `Reconnecting in ${backoffDelay}ms (attempt ${get().reconnectAttempts + 1})`
          );
          
          setTimeout(() => {
            set((state) => {
              state.reconnectAttempts += 1;
            });
            get().connectWebSocket();
          }, backoffDelay);
        } else if (event.code === 1008) {
          console.error('Authentication failed, will not auto-reconnect');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        // No need to handle here, the onclose handler will be called after an error
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      set((state) => {
        state.reconnectAttempts += 1;
        state.isConnecting = false;
      });
      
      // Schedule another reconnection attempt
      const backoffDelay = get().calculateBackoff();
      setTimeout(() => {
        get().connectWebSocket();
      }, backoffDelay);
    }
  },

  subscribeToConversation: async (conversationId: string) => {
    const state = get();
    const socket = state.socket;
    const topic = `conversation:${conversationId}`;
    
    // Store subscription in AsyncStorage for reconnection recovery
    try {
      const storedTopics = await AsyncStorage.getItem('websocket_subscriptions');
      let topics: string[] = storedTopics ? JSON.parse(storedTopics) : [];
      
      if (!topics.includes(topic)) {
        topics.push(topic);
        await AsyncStorage.setItem('websocket_subscriptions', JSON.stringify(topics));
      }
    } catch (e: unknown) {
      console.error('Failed to store subscription:', e instanceof Error ? e.message : e);
    }
    
    // Send subscription message if socket is open
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          topic: topic,
        })
      );
      console.log(`Subscribed to ${topic}`);
    } else {
      console.log(`Socket not open, subscription to ${topic} will be sent when connected`);
      // If socket isn't open, connectWebSocket will handle subscriptions when connected
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        get().connectWebSocket();
      }
    }
  },

  unsubscribeFromConversation: async (conversationId: string) => {
    const state = get();
    const socket = state.socket;
    const topic = `conversation:${conversationId}`;
    
    // Remove subscription from AsyncStorage
    try {
      const storedTopics = await AsyncStorage.getItem('websocket_subscriptions');
      if (storedTopics) {
        let topics: string[] = JSON.parse(storedTopics);
        topics = topics.filter(t => t !== topic);
        await AsyncStorage.setItem('websocket_subscriptions', JSON.stringify(topics));
      }
    } catch (e: unknown) {
      console.error('Failed to remove subscription:', e instanceof Error ? e.message : e);
    }
    
    // Send unsubscribe message if socket is open
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'unsubscribe',
          topic: topic,
        })
      );
      console.log(`Unsubscribed from ${topic}`);
    }
  },

  clearMessages: () => {
    set((state) => {
      state.wsMessages = [];
    });
  },
}));