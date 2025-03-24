import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

// Constants
const NETWORK_STATUS_KEY = "vibecheck_network_status";
const OFFLINE_OPERATIONS_KEY = "vibecheck_offline_operations";
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Network status information
 */
export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  lastChecked: number;
}

/**
 * Types of operations that can be performed offline
 */
export type OfflineOperationType =
  | "create_conversation"
  | "upload_audio"
  | "refresh_token"
  | "authenticate";

/**
 * Offline operation structure
 */
export interface OfflineOperation {
  id: string;
  type: OfflineOperationType;
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
  priority: number;
}

/**
 * NetworkService provides centralized network monitoring and connectivity handling
 */
export class NetworkService {
  private static instance: NetworkService;
  private unsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private readonly listeners: Set<(status: NetworkStatus) => void> = new Set();
  private readonly offlineOperationHandlers: Map<
    OfflineOperationType,
    (data: Record<string, unknown>) => Promise<void>
  > = new Map();
  private currentStatus: NetworkStatus = {
    isConnected: false,
    isInternetReachable: false,
    type: "unknown",
    lastChecked: 0,
  };
  private isMonitoring = false;
  private processingOperations = false;

  /**
   * Get the NetworkService singleton instance
   */
  public static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Initialize network monitoring
   */
  public init(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.setupNetworkMonitoring();
    this.setupAppStateMonitoring();
    this.loadCachedStatus();
  }

  /**
   * Clean up network monitoring
   */
  public cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.isMonitoring = false;
    this.listeners.clear();
  }

  /**
   * Check if the device is currently online
   * @param forceCheck Force a new network check
   * @returns Promise resolving to online status
   */
  public async isOnline(forceCheck = false): Promise<boolean> {
    // Use cached value if recent and not forcing check
    if (
      !forceCheck &&
      this.currentStatus.lastChecked > 0 &&
      Date.now() - this.currentStatus.lastChecked < CACHE_TTL
    ) {
      return !!this.currentStatus.isInternetReachable;
    }

    try {
      const state = await NetInfo.fetch();
      this.updateNetworkStatus(state);
      return !!state.isInternetReachable;
    } catch (error) {
      console.error("Error checking network status:", error);
      return false;
    }
  }

  /**
   * Get detailed network status information
   * @param forceCheck Force a new network check
   * @returns Promise resolving to detailed network status
   */
  public async getNetworkStatus(forceCheck = false): Promise<NetworkStatus> {
    if (forceCheck) {
      const state = await NetInfo.fetch();
      this.updateNetworkStatus(state);
    }

    return { ...this.currentStatus };
  }

  /**
   * Add a network status change listener
   * @param listener Function to call when network status changes
   * @returns Unsubscribe function
   */
  public addListener(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.add(listener);

    // Immediately notify with current status
    listener({ ...this.currentStatus });

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Queue an operation to be performed when online
   * @param type Type of operation
   * @param data Operation data
   * @param priority Priority (higher = more important)
   * @returns Promise that resolves when operation is queued
   */
  public async queueOfflineOperation(
    type: OfflineOperationType,
    data: Record<string, unknown>,
    priority = 1,
  ): Promise<string> {
    const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const operation: OfflineOperation = {
      id,
      type,
      data,
      timestamp: Date.now(),
      retries: 0,
      priority,
    };

    const operations = await this.getOfflineOperations();
    operations.push(operation);

    await AsyncStorage.setItem(
      OFFLINE_OPERATIONS_KEY,
      JSON.stringify(operations),
    );

    return id;
  }

  /**
   * Register a handler for processing offline operations
   * @param type Operation type
   * @param handler Function to handle the operation
   */
  public registerOfflineOperationHandler(
    type: OfflineOperationType,
    handler: (data: Record<string, unknown>) => Promise<void>,
  ): void {
    this.offlineOperationHandlers.set(type, handler);
  }

  /**
   * Process any pending offline operations
   * @returns Promise that resolves when all operations are processed
   */
  public async processOfflineOperations(): Promise<void> {
    // Prevent concurrent processing
    if (this.processingOperations) return;

    // Only process if online
    const isOnline = await this.isOnline(true);
    if (!isOnline) return;

    this.processingOperations = true;

    try {
      const operations = await this.getOfflineOperations();
      if (operations.length === 0) return;

      console.log(`Processing ${operations.length} pending offline operations`);

      // Sort by priority (higher first) then timestamp (older first)
      operations.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      const remainingOperations: OfflineOperation[] = [];
      const completedIds: string[] = [];

      // Process each operation
      for (const operation of operations) {
        const handler = this.offlineOperationHandlers.get(operation.type);

        if (!handler) {
          console.warn(
            `No handler registered for offline operation type: ${operation.type}`,
          );
          remainingOperations.push(operation);
          continue;
        }

        try {
          await handler(operation.data);
          completedIds.push(operation.id);
        } catch (error) {
          console.error(
            `Error processing offline operation (${operation.type}):`,
            error,
          );

          // Increment retry count and keep if under limit
          operation.retries++;
          if (operation.retries < 3) {
            remainingOperations.push(operation);
          } else {
            console.warn(
              `Dropping offline operation after 3 retries: ${operation.id}`,
            );
          }
        }
      }

      // Save remaining operations
      await AsyncStorage.setItem(
        OFFLINE_OPERATIONS_KEY,
        JSON.stringify(remainingOperations),
      );

      console.log(
        `Completed ${completedIds.length} offline operations, ${remainingOperations.length} remaining`,
      );
    } catch (error) {
      console.error("Error processing offline operations:", error);
    } finally {
      this.processingOperations = false;
    }
  }

  /**
   * Clear all pending offline operations
   */
  public async clearOfflineOperations(): Promise<void> {
    await AsyncStorage.removeItem(OFFLINE_OPERATIONS_KEY);
  }

  /**
   * Get all pending offline operations
   */
  private async getOfflineOperations(): Promise<OfflineOperation[]> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_OPERATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Error getting offline operations:", error);
      return [];
    }
  }

  /**
   * Set up monitoring for network status changes
   */
  private setupNetworkMonitoring(): void {
    this.unsubscribe = NetInfo.addEventListener((state) => {
      this.updateNetworkStatus(state);
    });
  }

  /**
   * Set up monitoring for app state changes to detect
   * when app comes to foreground
   */
  private setupAppStateMonitoring(): void {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        // App came to foreground, check network status
        this.isOnline(true).then((isOnline) => {
          if (isOnline) {
            this.processOfflineOperations();
          }
        });
      }
    };

    this.appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
  }

  /**
   * Update network status and notify listeners
   */
  private updateNetworkStatus(state: NetInfoState): void {
    this.currentStatus = {
      isConnected: !!state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      lastChecked: Date.now(),
    };

    // Store in cache
    AsyncStorage.setItem(
      NETWORK_STATUS_KEY,
      JSON.stringify(this.currentStatus),
    ).catch((error) => {
      console.error("Error saving network status:", error);
    });

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener({ ...this.currentStatus });
      } catch (error) {
        console.error("Error in network status listener:", error);
      }
    });

    // If we just came online, process pending operations
    if (state.isInternetReachable) {
      this.processOfflineOperations();
    }
  }

  /**
   * Load cached network status from storage
   */
  private async loadCachedStatus(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(NETWORK_STATUS_KEY);
      if (data) {
        const cachedStatus = JSON.parse(data) as NetworkStatus;

        // Only use cached status if recent
        if (Date.now() - cachedStatus.lastChecked < CACHE_TTL) {
          this.currentStatus = cachedStatus;
        }
      }
    } catch (error) {
      console.error("Error loading cached network status:", error);
    }
  }
}

// Export a singleton instance
export const networkService = NetworkService.getInstance();
