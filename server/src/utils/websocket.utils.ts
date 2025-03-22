import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { config } from '../config.js';
import { logger } from './logger.utils.js';
import * as jwt from 'jsonwebtoken';

// Improve type definitions for WebSockets and JWT
declare module 'jsonwebtoken' {
  export interface JwtPayload {
    sub?: string;
    [key: string]: any;
  }
}

// Augment WebSocket interface with missing types
declare module 'ws' {
  interface WebSocket {
    // Add ping method which is used but not typed in some ws versions
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    
    // We can't use static here as it's not allowed in interface properties
    // Instead, we'll access these as WebSocket.OPEN in the code
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
    
    // Use Array.from to convert to array for TypeScript compatibility
    Array.from(this.clients.entries()).forEach(([clientId, data]) => {
      if (data.resetTime <= now) {
        this.clients.delete(clientId);
      }
    });
  }
}

/**
 * Extended WebSocket client with additional properties for our implementation
 */
interface WebSocketClient extends WebSocket {
  isAlive: boolean;
  userId?: string;
  subscriptions: Set<string>;
  // Add custom send method with our message format
  send(data: string | Buffer | ArrayBuffer | Buffer[]): void;
}

/**
 * Message format for WebSocket communication
 */
interface WebSocketMessage {
  type: string;
  payload: any;
  topic?: string;
}

/**
 * Upload status message types
 */
type UploadStatus = 'started' | 'progress' | 'completed' | 'failed';

/**
 * Upload status message
 */
interface UploadStatusMessage extends WebSocketMessage {
  type: 'upload_status';
  payload: {
    conversationId: string;
    status: UploadStatus;
    fileName?: string;
    fileSize?: number;
    progress?: number;
    error?: string;
    timestamp: string;
  };
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocketClient>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private rateLimiter: WebSocketRateLimiter;
  // Cache for conversation authorization to reduce database calls
  private conversationAuthCache: Map<string, Set<string>> = new Map(); // Map<conversationId, Set<userId>>

  constructor() {
    // Initialize rate limiter with 100 messages per minute
    this.rateLimiter = new WebSocketRateLimiter(
      60 * 1000, // 1 minute window
      100        // 100 messages per window
    );
    
    logger.info('WebSocket manager initialized with rate limiting');
    
    // Clean up authorization cache every hour
    setInterval(() => this.cleanupAuthCache(), 60 * 60 * 1000);
  }
  
  /**
   * Check if a user is authorized to access a conversation
   * For now, this is a simple implementation that trusts the client
   * In a production environment, this should validate against the database
   */
  private checkUserConversationAccess(userId: string, conversationId: string): boolean {
    // First check the cache
    if (this.conversationAuthCache.has(conversationId)) {
      const authorizedUsers = this.conversationAuthCache.get(conversationId);
      if (authorizedUsers?.has(userId)) {
        return true;
      }
    }
    
    // For now, we'll authorize any user who is subscribed to the conversation topic
    // This is a simplification - in a real implementation, we should check a database
    const userClients = this.clients.get(userId);
    if (!userClients) return false;
    
    const topic = `conversation:${conversationId}`;
    
    // Use Array.from instead of spread operator for better TypeScript compatibility
    const isSubscribed = Array.from(userClients).some(client => 
      client.subscriptions.has(topic)
    );
    
    // If authorized, add to cache for future quick lookups
    if (isSubscribed) {
      if (!this.conversationAuthCache.has(conversationId)) {
        this.conversationAuthCache.set(conversationId, new Set());
      }
      const userSet = this.conversationAuthCache.get(conversationId);
      if (userSet) {
        userSet.add(userId);
      }
    }
    
    return isSubscribed;
  }
  
  /**
   * Clean up the authorization cache periodically to prevent memory leaks
   */
  private cleanupAuthCache(): void {
    // Simple implementation: just clear the entire cache
    this.conversationAuthCache.clear();
    logger.debug('WebSocket authorization cache cleared');
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
            
            logger.info(`WebSocket client authenticated: ${ws.userId} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`WebSocket authentication failed for client from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}: ${errorMessage}`);
        logger.debug(`WebSocket auth error details: ${error instanceof Error ? error.stack : 'No stack trace available'}`);
          ws.close(1008, 'Authentication failed');
          return;
        }
      } else {
        logger.warn(`WebSocket connection attempt without token from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
        ws.close(1008, 'Authentication required');
        return;
      }

      // Handle pong messages to keep track of connection status
      ws.on('pong', () => {
        ws.isAlive = true;
        logger.debug(`WebSocket client ${ws.userId} responded to ping`); 
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
            logger.warn(`Rate limit exceeded for client ${ws.userId || 'unknown'}. Too many messages in window.`);
            return;
          }
          
          const data = JSON.parse(message) as WebSocketMessage;
          
          if (data.type === 'subscribe' && data.topic && ws.userId) {
            // Add topic to client's subscriptions
            ws.subscriptions.add(data.topic);
            logger.info(`Client ${ws.userId} subscribed to topic: ${data.topic}`);
            
            // Confirm subscription
            ws.send(JSON.stringify({
              type: 'subscribed',
              topic: data.topic
            }));
          } else if (data.type === 'unsubscribe' && data.topic) {
            // Remove topic from client's subscriptions
            ws.subscriptions.delete(data.topic);
            logger.info(`Client ${ws.userId} unsubscribed from topic: ${data.topic}`);
          } else if (data.type === 'upload_status' && data.topic && data.payload) {
            // Process and forward upload status updates to all subscribers
            const topicParts = data.topic.split(':');
            if (topicParts.length === 2 && topicParts[0] === 'conversation') {
              const conversationId = topicParts[1];
              const uploadMessage = data as UploadStatusMessage;
              
              // Validate that upload status message has required fields
              if (!uploadMessage.payload.status || !uploadMessage.payload.timestamp) {
                logger.warn(`Invalid upload_status message format from user ${ws.userId || 'unknown'}`);
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: {
                    code: 'invalid_format',
                    message: 'Upload status message is invalid'
                  }
                }));
                return;
              }
              
              // Security check: Only allow users to send updates for conversations they're authorized for
              if (ws.userId && this.checkUserConversationAccess(ws.userId, conversationId)) {
                // Log the upload status
                logger.info(`Upload ${uploadMessage.payload.status} for conversation ${conversationId}: ${
                  uploadMessage.payload.fileName || 'unknown file'
                }${
                  uploadMessage.payload.progress ? ` (${uploadMessage.payload.progress}%)` : ''
                }`);
                
                this.sendToConversation(conversationId, uploadMessage);
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error processing WebSocket message from user ${ws.userId || 'unknown'}: ${errorMessage}`);
          logger.debug(`WebSocket error details: ${error instanceof Error ? error.stack : 'No stack trace available'}`);
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
          const userClientCount = this.clients.get(ws.userId)?.size || 0;
          logger.info(`WebSocket client disconnected: ${ws.userId}. Remaining connections for this user: ${userClientCount}`);
        }
      });

      // Send welcome message
      const connectMessage = {
        type: 'connected',
        payload: { 
          message: 'Connected to VibeCheck WebSocket server',
          userId: ws.userId
        }
      };
      ws.send(JSON.stringify(connectMessage));
      logger.info(`Welcome message sent to user ${ws.userId}. Connection established successfully.`);
    });

    // Set up the ping interval
    this.pingInterval = setInterval(() => {
      let activeCount = 0;
      let terminatedCount = 0;
      
      this.wss?.clients.forEach((ws) => {
        const typedWs = ws as WebSocketClient;
        if (typedWs.isAlive === false) {
          logger.info(`Terminating inactive WebSocket connection for user: ${typedWs.userId || 'unknown'}`); 
          terminatedCount++;
          return typedWs.terminate();
        }
        
        typedWs.isAlive = false;
        typedWs.ping();
        activeCount++;
      });
      
      logger.info(`WebSocket health check: ${activeCount} active connections, ${terminatedCount} terminated`);
    }, config.webSocket.pingInterval) as unknown as NodeJS.Timeout;

    this.wss.on('close', () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    });

    logger.info(`WebSocket server setup complete on path: ${config.webSocket.path}. Ping interval: ${config.webSocket.pingInterval}ms`);
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

    logger.info(`Sent WebSocket message type '${message.type}' to ${sent}/${userClients?.size || 0} clients for user: ${userId}`);
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

    const totalClients = Array.from(this.clients.values()).reduce((acc, clientSet) => acc + clientSet.size, 0);
    logger.info(`Sent WebSocket message type '${message.type}' to ${sent}/${totalClients} clients for conversation: ${conversationId}`);
    
    // Log message payload at debug level for detailed troubleshooting
    logger.debug(`Message payload for conversation ${conversationId}: ${JSON.stringify(message.payload)}`);
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

    const totalClients = this.wss ? this.wss.clients.size : 0;
    logger.info(`Broadcast WebSocket message type '${message.type}' to ${sent}/${totalClients} clients`);
    
    // Log message payload at debug level
    logger.debug(`Broadcast message payload: ${JSON.stringify(message.payload)}`);
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