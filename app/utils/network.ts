/**
 * Network utility functions
 * Centralized network status checking and monitoring
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { logError } from './error-logger';

// Constants
const NETWORK_STATUS_KEY = 'network_status';
const NETWORK_CACHE_TTL = 60000; // 1 minute in milliseconds

/**
 * Network status types
 */
export type NetworkStatus = 'connected' | 'disconnected' | 'unknown';

/**
 * Network status with last check timestamp
 */
export interface NetworkStatusData {
  /** Whether device is connected to network */
  isConnected: boolean;
  /** Last time network status was checked */
  lastChecked: number;
  /** Whether device has internet access */
  hasInternet: boolean;
}

/**
 * Check if device is currently online
 * @returns Promise resolving to network status
 */
export async function checkNetworkStatus(): Promise<NetworkStatus> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ? 'connected' : 'disconnected';
  } catch (error) {
    console.warn('Failed to check network status:', error);
    return 'unknown';
  }
}

/**
 * Check if the device is currently online, with caching for performance
 * @param forceCheck Whether to force a new check vs using cached status
 * @returns Promise resolving to online status
 */
export async function isOnline(forceCheck = false): Promise<boolean> {
  try {
    // Check if we have a recent status check (within TTL)
    if (!forceCheck) {
      const cachedStatusJson = await AsyncStorage.getItem(NETWORK_STATUS_KEY);
      if (cachedStatusJson) {
        const cachedStatus = JSON.parse(cachedStatusJson) as NetworkStatusData;
        const isCacheValid = Date.now() - cachedStatus.lastChecked < NETWORK_CACHE_TTL;
        
        if (isCacheValid) {
          return cachedStatus.hasInternet;
        }
      }
    }
    
    // Perform a fresh network check
    const networkState = await NetInfo.fetch();
    const status: NetworkStatusData = {
      isConnected: Boolean(networkState.isConnected),
      hasInternet: Boolean(networkState.isInternetReachable),
      lastChecked: Date.now()
    };
    
    // Cache the result
    await AsyncStorage.setItem(NETWORK_STATUS_KEY, JSON.stringify(status));
    
    return status.hasInternet;
  } catch (error) {
    logError(error, 'isOnline', { forceCheck });
    // Default to online in case of error checking status
    // This prevents blocking operations unnecessarily
    return true;
  }
}

/**
 * Setup network change listeners
 * @param callback Function to call when network state changes
 * @returns Unsubscribe function
 */
export function setupNetworkListeners(
  callback?: (state: NetInfoState) => void
): () => void {
  // Subscribe to network state changes
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    // Update cached network status
    const status: NetworkStatusData = {
      isConnected: Boolean(state.isConnected),
      hasInternet: Boolean(state.isInternetReachable),
      lastChecked: Date.now()
    };
    
    AsyncStorage.setItem(NETWORK_STATUS_KEY, JSON.stringify(status))
      .catch(error => {
        logError(error, 'updateNetworkStatus');
      });
      
    // Call the callback if provided
    if (callback) {
      callback(state);
    }
  });
  
  return unsubscribe;
}

/**
 * Get the cached network status
 * @returns Promise resolving to cached network status
 */
export async function getCachedNetworkStatus(): Promise<NetworkStatusData | null> {
  try {
    const cachedStatusJson = await AsyncStorage.getItem(NETWORK_STATUS_KEY);
    if (cachedStatusJson) {
      return JSON.parse(cachedStatusJson) as NetworkStatusData;
    }
    return null;
  } catch (error) {
    logError(error, 'getCachedNetworkStatus');
    return null;
  }
}