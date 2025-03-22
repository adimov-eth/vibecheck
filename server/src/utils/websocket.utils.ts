import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { config } from '../config.js';
import { logger } from './logger.utils.js';
import jwt from 'jsonwebtoken';

// Add declaration file for jsonwebtoken
declare module 'jsonwebtoken' {
  export interface JwtPayload {
    sub?: string;
    [key: string]: any;
  }
}

// Declare module augmentation for missing types
declare module 'ws' {
  interface WebSocket {
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
  }
}

// Simple rate limiter for WebSockets
class WebSocketRateLimiter {
  private clients: Map<string, { count: number, resetTime: number }> = new Map();
  private windowMs: number;
  private maxMessagesPerWindow: number;

  constructor(windowMs = 60000, maxMessagesPerWindow = 100) {
    this.windowMs = windowMs;
    this.maxMessagesPerWindow = maxMessagesPerWindow;
    
    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  public allowMessage(clientId: string): boolean {
    const now = Date.now();
    
    // Get or create client entry
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        count: 0,
        resetTime: now + this.windowMs
      });
    }
    
    const client = this.clients.get(clientId)!;
    
    // Reset if window expired
    if (client.resetTime <= now) {
      client.count = 0;
      client.resetTime = now + this.windowMs;
    }
    
    // Increment count and check limit
    client.count++;
    return client.count <= this.maxMessagesPerWindow;
  }
  
  private cleanup() {
    const now = Date.now();
    for (const [clientId, data] of this.clients.entries()) {
      if (data.resetTime <= now) {
        this.clients.delete(clientId);
      }
    }
  }
}

interface WebSocketClient extends WebSocket {
  isAlive: boolean;
  userId?: string;
  subscriptions: Set<string>;
}

interface WebSocketMessage {
  type: string;
  payload: any;
  topic?: string;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocketClient>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private rateLimiter: WebSocketRateLimiter;

  constructor() {
    // Initialize rate limiter with 100 messages per minute
    this.rateLimiter = new WebSocketRateLimiter(
      60 * 1000, // 1 minute window
      100        // 100 messages per window
    );
    
    logger.info('WebSocket manager initialized with rate limiting');
  }

  public initialize(server: Server) {
    if (!config.webSocket.enabled) {
      logger.info('WebSocket server is disabled');
      return;
    }

    this.wss = new WebSocketServer({ 
      server, 
      path: config.webSocket.path 
    });

    logger.info(`WebSocket server initialized on path: ${config.webSocket.path}`);

    this.wss.on('connection', (ws: WebSocketClient, req) => {
      ws.isAlive = true;
      ws.subscriptions = new Set();

      // Parse the token from the request URL
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      // Authenticate the connection
      if (token) {
        try {
          const decoded = jwt.verify(token, config.clerkSecretKey) as { sub?: string, [key: string]: any };
          if (decoded && decoded.sub) {
            ws.userId = decoded.sub;
            
            // Add client to users map
            if (!this.clients.has(ws.userId)) {
              this.clients.set(ws.userId, new Set());
            }
            this.clients.get(ws.userId)?.add(ws);
            
            logger.debug(`WebSocket client authenticated: ${ws.userId}`);
          }
        } catch (error) {
          logger.error('WebSocket authentication failed:', error);
          ws.close(1008, 'Authentication failed');
          return;
        }
      } else {
        logger.warn('WebSocket connection attempt without token');
        ws.close(1008, 'Authentication required');
        return;
      }

      // Handle pong messages to keep track of connection status
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages from clients
      ws.on('message', (message: string) => {
        try {
          // Apply rate limiting
          if (!ws.userId || !this.rateLimiter.allowMessage(ws.userId)) {
            // Send rate limit exceeded message
            ws.send(JSON.stringify({
              type: 'error',
              payload: {
                code: 'rate_limit_exceeded',
                message: 'Rate limit exceeded. Please slow down your requests.'
              }
            }));
            logger.warn(`Rate limit exceeded for client ${ws.userId || 'unknown'}`);
            return;
          }
          
          const data = JSON.parse(message) as WebSocketMessage;
          
          if (data.type === 'subscribe' && data.topic && ws.userId) {
            // Add topic to client's subscriptions
            ws.subscriptions.add(data.topic);
            logger.debug(`Client ${ws.userId} subscribed to ${data.topic}`);
            
            // Confirm subscription
            ws.send(JSON.stringify({
              type: 'subscribed',
              topic: data.topic
            }));
          } else if (data.type === 'unsubscribe' && data.topic) {
            // Remove topic from client's subscriptions
            ws.subscriptions.delete(data.topic);
            logger.debug(`Client unsubscribed from ${data.topic}`);
          } else if (data.type === 'upload_status' && data.topic && data.payload) {
            // Forward upload status updates to all subscribers
            const topicParts = data.topic.split(':');
            if (topicParts.length === 2 && topicParts[0] === 'conversation') {
              const conversationId = topicParts[1];
              
              // Security check: Only allow users to send updates for conversations they're authorized for
              if (ws.userId && this.isUserAuthorizedForConversation(ws.userId, conversationId)) {
                this.sendToConversation(conversationId, data);
              } else {
                // Log unauthorized attempt and send error to client
                const logUserId = ws.userId || 'unknown';
                logger.warn(`Unauthorized upload_status attempt for conversation ${conversationId} by user ${logUserId}`);
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: {
                    code: 'unauthorized',
                    message: 'You are not authorized to send updates to this conversation'
                  }
                }));
              }
            }
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        if (ws.userId) {
          // Remove client from users map
          this.clients.get(ws.userId)?.delete(ws);
          if (this.clients.get(ws.userId)?.size === 0) {
            this.clients.delete(ws.userId);
          }
          logger.debug(`WebSocket client disconnected: ${ws.userId}`);
        }
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        payload: { 
          message: 'Connected to VibeCheck WebSocket server',
          userId: ws.userId
        }
      }));
    });

    // Set up the ping interval
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const typedWs = ws as WebSocketClient;
        if (typedWs.isAlive === false) {
          logger.debug('Terminating inactive WebSocket connection');
          return typedWs.terminate();
        }
        
        typedWs.isAlive = false;
        typedWs.ping();
      });
    }, config.webSocket.pingInterval) as unknown as NodeJS.Timeout;

    this.wss.on('close', () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });

    logger.info('WebSocket server setup complete');
  }

  /**
   * Send a message to a specific user
   */
  public sendToUser(userId: string, message: WebSocketMessage) {
    if (!this.wss || !config.webSocket.enabled) return;
    
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      logger.debug(`No active WebSocket connections for user: ${userId}`);
      return;
    }

    const messageStr = JSON.stringify(message);
    let sent = 0;

    userClients.forEach(client => {
      // If there's a topic, only send to clients subscribed to that topic
      if (!message.topic || client.subscriptions.has(message.topic)) {
        client.send(messageStr);
        sent++;
      }
    });

    logger.debug(`Sent WebSocket message to ${sent} clients for user: ${userId}`);
  }

  /**
   * Send a message to a specific conversation's subscribers
   */
  public sendToConversation(conversationId: string, message: WebSocketMessage) {
    if (!this.wss || !config.webSocket.enabled) return;
    
    const topic = `conversation:${conversationId}`;
    message.topic = topic;

    let sent = 0;
    this.clients.forEach((clients, userId) => {
      clients.forEach(client => {
        if (client.subscriptions.has(topic)) {
          client.send(JSON.stringify(message));
          sent++;
        }
      });
    });

    logger.debug(`Sent WebSocket message to ${sent} clients for conversation: ${conversationId}`);
  }

  /**
   * Send a broadcast message to all connected clients
   */
  public broadcast(message: WebSocketMessage) {
    if (!this.wss || !config.webSocket.enabled) return;
    
    const messageStr = JSON.stringify(message);
    let sent = 0;

    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sent++;
      }
    });

    logger.debug(`Broadcast WebSocket message to ${sent} clients`);
  }

  /**
   * Check if a user is authorized to access a conversation
   * This is a security measure to prevent users from sending messages to conversations they don't have access to
   */
  private isUserAuthorizedForConversation(userId: string, conversationId: string): boolean {
    // Check if the user is subscribed to this conversation
    // A user is considered authorized if they have at least one active connection subscribed to the conversation
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      return false;
    }
    
    const topic = `conversation:${conversationId}`;
    return Array.from(userClients).some(client => client.subscriptions.has(topic));
  }

  public shutdown() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      logger.info('WebSocket server shut down');
    }
  }
}

// Create a singleton instance
export const websocketManager = new WebSocketManager();