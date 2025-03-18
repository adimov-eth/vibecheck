/**
 * Offline authentication handler
 * Manages authentication operations when device is offline
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetInfoState } from '@react-native-community/netinfo';
import { TokenStatus, TokenMetadata } from '../types/auth';
import { logError } from './error-logger';
import { isOnline, setupNetworkListeners as setupBaseNetworkListeners, NetworkStatusData } from './network';

// Constants
const OFFLINE_AUTH_KEY = 'offline_auth_operations';

/**
 * Offline operation type
 */
type OfflineOperationType = 'token_refresh' | 'sign_out' | 'credential_update';

/**
 * Pending offline operation
 */
interface PendingOperation {
  /** Unique identifier for operation */
  id: string;
  /** Type of operation */
  type: OfflineOperationType;
  /** When operation was created */
  timestamp: number;
  /** Operation data */
  data?: Record<string, unknown>;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Queue an operation to be performed when device is back online
 * @param type Type of operation
 * @param data Operation data
 * @returns Promise resolving when operation is queued
 */
export async function queueOfflineOperation(
  type: OfflineOperationType,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    // Create new operation
    const operation: PendingOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      timestamp: Date.now(),
      data,
      retryCount: 0
    };
    
    // Get existing operations
    const operationsJson = await AsyncStorage.getItem(OFFLINE_AUTH_KEY);
    const operations: PendingOperation[] = operationsJson 
      ? JSON.parse(operationsJson) 
      : [];
    
    // Add new operation
    operations.push(operation);
    
    // Save updated queue
    await AsyncStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(operations));
  } catch (error) {
    logError(error, 'queueOfflineOperation', { type, data });
  }
}

/**
 * Get pending offline operations
 * @returns Promise resolving to array of pending operations
 */
export async function getPendingOperations(): Promise<PendingOperation[]> {
  try {
    const operationsJson = await AsyncStorage.getItem(OFFLINE_AUTH_KEY);
    return operationsJson ? JSON.parse(operationsJson) : [];
  } catch (error) {
    logError(error, 'getPendingOperations');
    return [];
  }
}

/**
 * Remove a completed operation from the queue
 * @param operationId ID of operation to remove
 * @returns Promise resolving when operation is removed
 */
export async function removeOperation(operationId: string): Promise<void> {
  try {
    // Get existing operations
    const operationsJson = await AsyncStorage.getItem(OFFLINE_AUTH_KEY);
    const operations: PendingOperation[] = operationsJson 
      ? JSON.parse(operationsJson) 
      : [];
    
    // Filter out the operation to remove
    const updatedOperations = operations.filter(op => op.id !== operationId);
    
    // Save updated queue
    await AsyncStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(updatedOperations));
  } catch (error) {
    logError(error, 'removeOperation', { operationId });
  }
}

/**
 * Increment retry count for an operation
 * @param operationId ID of operation
 * @returns Promise resolving when operation is updated
 */
export async function incrementRetryCount(operationId: string): Promise<void> {
  try {
    // Get existing operations
    const operationsJson = await AsyncStorage.getItem(OFFLINE_AUTH_KEY);
    const operations: PendingOperation[] = operationsJson 
      ? JSON.parse(operationsJson) 
      : [];
    
    // Find and update operation
    const updatedOperations = operations.map(op => {
      if (op.id === operationId) {
        return { ...op, retryCount: op.retryCount + 1 };
      }
      return op;
    });
    
    // Save updated queue
    await AsyncStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(updatedOperations));
  } catch (error) {
    logError(error, 'incrementRetryCount', { operationId });
  }
}

/**
 * Check token validity considering offline status
 * @param tokenData Token metadata
 * @returns Token status accounting for offline state
 */
export async function checkOfflineTokenValidity(
  tokenData: TokenMetadata | null
): Promise<TokenStatus> {
  // If no token data, it's invalid
  if (!tokenData || !tokenData.token) {
    return 'invalid';
  }
  
  // Check if device is online
  const online = await isOnline();
  
  // If offline and we have a token, consider it tentatively valid
  // This allows offline usage with cached token
  if (!online) {
    // If token has expiry and it's not expired, it's valid
    if (tokenData.expiryTime && Date.now() < tokenData.expiryTime) {
      return 'valid';
    }
    
    // If token has expiry and it's expired, mark as expired
    if (tokenData.expiryTime && Date.now() >= tokenData.expiryTime) {
      return 'expired';
    }
    
    // If we have a token but no expiry info, assume valid while offline
    return 'valid';
  }
  
  // Online checks follow normal token validation logic
  if (tokenData.expiryTime) {
    return Date.now() < tokenData.expiryTime ? 'valid' : 'expired';
  }
  
  // If we're online but token has no expiry info, consider unknown
  return 'unknown';
}

/**
 * Setup network change listeners for offline queue processing
 * @param processQueue Function to process offline queue when online
 * @returns Unsubscribe function
 */
export function setupNetworkListeners(
  processQueue: () => Promise<void>
): () => void {
  // Subscribe to network state changes using the shared implementation
  return setupBaseNetworkListeners((state: NetInfoState) => {
    // When device comes online, process queued operations
    if (state.isConnected && state.isInternetReachable) {
      processQueue().catch(error => {
        logError(error, 'processQueue');
      });
    }
  });
}
