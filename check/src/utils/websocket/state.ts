import type { WebSocket, WebSocketServer } from 'ws';
import { log } from '@/utils/logger';

// Interface for our WebSocket client, extending ws.WebSocket
export interface WebSocketClient extends WebSocket {
  userId?: string; // Optional during authentication phase, required after
  isAlive: boolean;
  subscribedTopics: Set<string>;
  isAuthenticating: boolean; // Flag to track authentication status
  connectedAt: number; // Timestamp when connection was established
  lastActivity: number; // Last time this connection was active
  connectionId: string; // Unique identifier for this connection
}

// Module-level state
let wss: WebSocketServer | null = null;
const clientsByUserId = new Map<string, Set<WebSocketClient>>();
const allClients = new Map<string, WebSocketClient>(); // Track all clients by connectionId
let pingInterval: NodeJS.Timer | null = null;
let cleanupInterval: NodeJS.Timer | null = null;

// Configuration
const MAX_CONNECTIONS_PER_USER = 5;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export const getWss = (): WebSocketServer | null => wss;
export const setWss = (server: WebSocketServer | null): void => { wss = server; };

export const getClientsByUserId = (): Map<string, Set<WebSocketClient>> => clientsByUserId;

export const getPingInterval = (): NodeJS.Timer | null => pingInterval;
export const setPingInterval = (interval: NodeJS.Timer | null): void => { pingInterval = interval; };

export const addClientToUser = (userId: string, client: WebSocketClient): void => {
    if (!clientsByUserId.has(userId)) {
        clientsByUserId.set(userId, new Set());
    }
    
    const userClients = clientsByUserId.get(userId)!;
    
    // Enforce connection limit per user
    if (userClients.size >= MAX_CONNECTIONS_PER_USER) {
        const oldestClient = findOldestClient(userClients);
        if (oldestClient) {
            log.info('Disconnecting oldest client due to connection limit', {
                userId,
                connectionId: oldestClient.connectionId,
                maxConnections: MAX_CONNECTIONS_PER_USER
            });
            oldestClient.close(1000, 'Too many connections');
            removeClientFromUser(userId, oldestClient);
        }
    }
    
    userClients.add(client);
    allClients.set(client.connectionId, client);
    
    log.debug('Added client to user', {
        userId,
        connectionId: client.connectionId,
        totalUserConnections: userClients.size,
        totalConnections: allClients.size
    });
};

export const removeClientFromUser = (userId: string, client: WebSocketClient): number => {
    const userClientSet = clientsByUserId.get(userId);
    if (userClientSet) {
        userClientSet.delete(client);
        const remainingCount = userClientSet.size;
        if (remainingCount === 0) {
            clientsByUserId.delete(userId);
        }
        
        allClients.delete(client.connectionId);
        
        log.debug('Removed client from user', {
            userId,
            connectionId: client.connectionId,
            remainingUserConnections: remainingCount,
            totalConnections: allClients.size
        });
        
        return remainingCount;
    }
    return 0;
};

export const clearAllClients = (): void => {
    log.info('Clearing all WebSocket clients', {
        totalUsers: clientsByUserId.size,
        totalConnections: allClients.size
    });
    
    // Close all connections gracefully
    for (const client of allClients.values()) {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1001, 'Server shutdown');
        }
    }
    
    clientsByUserId.clear();
    allClients.clear();
};

// Helper function to find the oldest client in a set
function findOldestClient(clients: Set<WebSocketClient>): WebSocketClient | null {
    let oldest: WebSocketClient | null = null;
    let oldestTime = Date.now();
    
    for (const client of clients) {
        if (client.connectedAt < oldestTime) {
            oldestTime = client.connectedAt;
            oldest = client;
        }
    }
    
    return oldest;
}

// Enhanced connection management functions
export const updateClientActivity = (client: WebSocketClient): void => {
    client.lastActivity = Date.now();
    client.isAlive = true;
};

export const getConnectionStats = (): {
    totalConnections: number;
    totalUsers: number;
    connectionsByUser: Array<{ userId: string; connections: number }>;
    idleConnections: number;
    oldestConnection: number | null;
} => {
    const now = Date.now();
    let idleCount = 0;
    let oldestConnectionTime: number | null = null;
    
    for (const client of allClients.values()) {
        const idleTime = now - client.lastActivity;
        if (idleTime > IDLE_TIMEOUT) {
            idleCount++;
        }
        
        if (oldestConnectionTime === null || client.connectedAt < oldestConnectionTime) {
            oldestConnectionTime = client.connectedAt;
        }
    }
    
    const connectionsByUser = Array.from(clientsByUserId.entries()).map(([userId, clients]) => ({
        userId,
        connections: clients.size
    }));
    
    return {
        totalConnections: allClients.size,
        totalUsers: clientsByUserId.size,
        connectionsByUser,
        idleConnections: idleCount,
        oldestConnection: oldestConnectionTime
    };
};

export const cleanupIdleConnections = (): number => {
    const now = Date.now();
    const idleClients: WebSocketClient[] = [];
    
    for (const client of allClients.values()) {
        const idleTime = now - client.lastActivity;
        if (idleTime > IDLE_TIMEOUT) {
            idleClients.push(client);
        }
    }
    
    for (const client of idleClients) {
        log.info('Closing idle WebSocket connection', {
            connectionId: client.connectionId,
            userId: client.userId,
            idleTime: Math.round((now - client.lastActivity) / 1000)
        });
        
        client.close(1000, 'Idle timeout');
        
        if (client.userId) {
            removeClientFromUser(client.userId, client);
        }
    }
    
    return idleClients.length;
};

export const startCleanupInterval = (): void => {
    if (cleanupInterval) {
        return; // Already started
    }
    
    cleanupInterval = setInterval(() => {
        const cleanedUp = cleanupIdleConnections();
        if (cleanedUp > 0) {
            log.info('Cleaned up idle WebSocket connections', { count: cleanedUp });
        }
    }, 60000); // Check every minute
    
    log.info('Started WebSocket cleanup interval');
};

export const stopCleanupInterval = (): void => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        log.info('Stopped WebSocket cleanup interval');
    }
};

export const handleMemoryPressure = (): number => {
    log.warn('Memory pressure detected, aggressively cleaning WebSocket connections');
    
    // Close connections that have been idle for more than 1 minute
    const now = Date.now();
    const aggressiveIdleLimit = 60 * 1000; // 1 minute
    const clientsToClose: WebSocketClient[] = [];
    
    for (const client of allClients.values()) {
        const idleTime = now - client.lastActivity;
        if (idleTime > aggressiveIdleLimit) {
            clientsToClose.push(client);
        }
    }
    
    for (const client of clientsToClose) {
        log.info('Closing connection due to memory pressure', {
            connectionId: client.connectionId,
            userId: client.userId,
            idleTime: Math.round((now - client.lastActivity) / 1000)
        });
        
        client.close(1000, 'Memory pressure cleanup');
        
        if (client.userId) {
            removeClientFromUser(client.userId, client);
        }
    }
    
    return clientsToClose.length;
};