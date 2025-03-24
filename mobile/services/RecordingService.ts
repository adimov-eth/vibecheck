import { Audio } from "expo-av";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

import type {
  RecordingMode,
  RecordingServiceStatus,
  RecordingStatus
} from "@/types/recording";
import { apiClient } from "./api";
import { errorService, handleError } from "./ErrorService";
import { eventBus } from "./EventBus";
import { networkService } from "./NetworkService";
import { webSocketService } from "./WebSocketService";

// Directory for storing audio recordings
const AUDIO_DIRECTORY = `${FileSystem.documentDirectory}audio/`;

// Types
export interface RecordingResult {
  uri: string;
  duration: number;
  partner: 1 | 2;
}

// Event types
export type RecordingEvent =
  | "status-change"
  | "progress-update"
  | "error"
  | "recording-complete"
  | "processing-complete";

// Event handler types
export interface RecordingEventHandlers {
  "status-change": (status: RecordingStatus) => void;
  "progress-update": (progress: number) => void;
  "error": (error: string) => void;
  "recording-complete": (result: RecordingResult) => void;
  "processing-complete": (conversationId: string) => void;
}

// Lock mechanism to prevent race conditions
class RecordingLock {
  private isLocked = false;
  private queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => resolve());
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.isLocked = false;
    }
  }
}

/**
 * Central service managing all recording functionality
 */
export class RecordingService {
  private static instance: RecordingService;

  // State
  private recordingStatus: RecordingStatus = "idle";
  private recordingMode: RecordingMode = "separate";
  private currentPartner: 1 | 2 = 1;
  private conversationId: string | null = null;
  private recording: Audio.Recording | null = null;
  private savedRecordings: Audio.Recording[] = [];
  private audioUris: { partner1?: string; partner2?: string } = {};
  private processingProgress: number = 0;
  private recordingStartTime: number | null = null;
  private recordingDuration: number = 0;
  private durationTimer: NodeJS.Timeout | null = null;
  private isReleased: boolean = false;
  private hasPermission: boolean = false;
  private error: string | null = null;

  // Lock mechanism to prevent race conditions
  private lock = new RecordingLock();

  // Event listeners
  private listeners: Map<RecordingEvent, Set<RecordingEventHandlers[RecordingEvent]>> = new Map();

  /**
   * Get singleton instance
   */
  public static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }
    return RecordingService.instance;
  }

  private constructor() {
    // Initialize listeners map
    this.listeners.set("status-change", new Set());
    this.listeners.set("progress-update", new Set());
    this.listeners.set("error", new Set());
    this.listeners.set("recording-complete", new Set());
    this.listeners.set("processing-complete", new Set());

    // Request permissions on initialization
    this.requestPermissions();

    // Register with network service for offline operations
    networkService.registerOfflineOperationHandler(
      "upload_audio",
      this.handleOfflineUpload.bind(this)
    );
  }

  /**
   * Add event listener
   */
  public addEventListener<E extends RecordingEvent>(
    event: E,
    callback: RecordingEventHandlers[E]
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const listeners = this.listeners.get(event) as Set<RecordingEventHandlers[E]>;
    listeners.add(callback);

    return () => {
      const listenerSet = this.listeners.get(event) as Set<RecordingEventHandlers[E]> | undefined;
      if (listenerSet) {
        listenerSet.delete(callback);
      }
    };
  }

  /**
   * Emit event to listeners
   */
  private emit<E extends RecordingEvent>(
    event: E,
    ...args: Parameters<RecordingEventHandlers[E]>
  ): void {
    const listeners = this.listeners.get(event) as Set<RecordingEventHandlers[E]> | undefined;

    if (listeners) {
      listeners.forEach((listener) => {
        try {
          // Call the listener with properly typed arguments
          (listener as (...args: unknown[]) => void)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Set recording status and notify listeners
   */
  private setStatus(status: RecordingStatus): void {
    this.recordingStatus = status;
    eventBus.emit("recording:status", status);
  }

  /**
   * Set error and notify listeners
   */
  private setError(error: string, options: { conversationId?: string } = {}): void {
    this.error = error;

    // Emit error event
    eventBus.emit("recording:error", error);

    // Use centralized error service
    errorService.handleRecordingError(error, {
      conversationId: options.conversationId || this.conversationId || undefined,
      updateStore: true,
      updateQueryCache: !!options.conversationId || !!this.conversationId,
    });
  }

  /**
   * Update progress and notify listeners
   */
  private updateProgress(progress: number): void {
    this.processingProgress = progress;
    eventBus.emit("recording:progress", progress);
  }

  /**
   * Request audio recording permissions
   */
  public async requestPermissions(): Promise<boolean> {
    await this.lock.acquire();

    try {
      this.setStatus("requesting-permissions");

      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === "granted";

      this.hasPermission = granted;
      this.setStatus(granted ? "idle" : "permission-denied");

      if (granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      }

      return granted;
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: "Failed to request recording permissions",
        serviceName: "RecordingService",
        errorType: "RECORDING_ERROR",
        severity: "ERROR",
        metadata: { status: "permission-denied" }
      });
      this.setStatus("permission-denied");
      this.setError(message);
      return false;
    } finally {
      this.lock.release();
    }
  }

  /**
   * Ensure audio directory exists
   */
  private async ensureAudioDirectoryExists(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIRECTORY);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(AUDIO_DIRECTORY, {
        intermediates: true,
      });
    }
  }

  /**
   * Generate a unique filename for the recording
   */
  private generateAudioFilename(prefix: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const extension = Platform.OS === "ios" ? "m4a" : "wav";
    return `${prefix}_${timestamp}_${randomString}.${extension}`;
  }

  /**
   * Initialize a new conversation
   */
  public async initializeConversation(
    modeId: string,
    recordingMode: RecordingMode
  ): Promise<string> {
    await this.lock.acquire();

    try {
      // Generate new conversation ID
      const newConversationId = Crypto.randomUUID();

      // Set recording mode
      this.recordingMode = recordingMode;

      // Reset state for a new conversation
      this.audioUris = {};
      this.processingProgress = 0;
      this.currentPartner = 1;
      this.error = null;

      let serverId: string;

      // Check if online
      const isOnline = await networkService.isOnline();
      if (isOnline) {
        try {
          // Create conversation in API
          serverId = await apiClient.createConversation(
            newConversationId,
            modeId,
            recordingMode
          );

          // Subscribe to WebSocket updates
          webSocketService.subscribe(`conversation:${serverId}`);
        } catch (error) {
          const { message } = handleError(error, {
            defaultMessage: "Failed to create conversation",
            serviceName: "RecordingService",
            errorType: "API_ERROR",
            severity: "WARNING",
            metadata: { 
              conversationId: newConversationId,
              modeId,
              recordingMode 
            }
          });

          // Log warning about falling back to offline mode
          console.warn(`Falling back to offline mode: ${message}`);

          // Queue for offline processing
          await networkService.queueOfflineOperation(
            "create_conversation",
            {
              id: newConversationId,
              modeId,
              recordingMode,
            }
          );

          serverId = newConversationId;
        }
      } else {
        // Offline mode - queue for later and use local ID
        await networkService.queueOfflineOperation(
          "create_conversation",
          {
            id: newConversationId,
            modeId,
            recordingMode,
          }
        );

        serverId = newConversationId;
      }

      // Store conversation ID
      this.conversationId = serverId;

      return serverId;
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: "Failed to initialize conversation",
        serviceName: "RecordingService",
        errorType: "RECORDING_ERROR",
        severity: "ERROR",
        metadata: { modeId, recordingMode }
      });
      this.setError(message);
      throw error;
    } finally {
      this.lock.release();
    }
  }

  /**
   * Start recording audio
   */
  public async startRecording(): Promise<boolean> {
    await this.lock.acquire();

    try {
      // Check if recording is already in progress
      if (this.recordingStatus === "recording") {
        console.log("Already recording");
        return false;
      }

      // Check permissions
      if (!this.hasPermission) {
        const granted = await this.requestPermissions();
        if (!granted) {
          this.setError("Recording permission denied");
          return false;
        }
      }

      this.setStatus("preparing");

      // Configure audio recording options
      const options = {
        android: {
          extension: ".wav",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 24000,
          numberOfChannels: 1,
          bitRate: 64000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 64000,
        },
      };

      // Create recording
      const { recording } = await Audio.Recording.createAsync(options);
      this.recording = recording;

      // Start duration tracking
      this.recordingStartTime = Date.now();
      this.recordingDuration = 0;
      this.durationTimer = setInterval(() => {
        if (this.recordingStartTime) {
          const elapsed = Math.floor(
            (Date.now() - this.recordingStartTime) / 1000
          );
          this.recordingDuration = elapsed;
        }
      }, 1000) as unknown as NodeJS.Timeout;

      // Update state
      this.setStatus("recording");
      this.isReleased = false;

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to start recording:", errorMsg);
      this.setStatus("failed");
      this.setError(`Failed to start recording: ${errorMsg}`);
      return false;
    } finally {
      this.lock.release();
    }
  }

  /**
   * Save a recording to the file system
   */
  private async saveAudioRecording(
    uri: string,
    conversationId: string,
    partnerPrefix: string
  ): Promise<string> {
    try {
      await this.ensureAudioDirectoryExists();

      // Generate filename and path
      const filename = this.generateAudioFilename(partnerPrefix);
      const newUri = `${AUDIO_DIRECTORY}${filename}`;

      // Save metadata
      const metadata = {
        conversationId,
        partnerPrefix,
        originalFilename: filename,
        timestamp: new Date().toISOString(),
      };

      // Store metadata alongside the file
      const metadataUri = `${newUri}.metadata.json`;
      await FileSystem.writeAsStringAsync(
        metadataUri,
        JSON.stringify(metadata)
      );

      // Copy the temporary recording file to our app's documents directory
      await FileSystem.copyAsync({
        from: uri,
        to: newUri,
      });

      // Delete the original temporary file
      const tempFileInfo = await FileSystem.getInfoAsync(uri);
      if (tempFileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }

      return newUri;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Error saving audio recording:", errorMsg);
      throw error;
    }
  }

  /**
   * Stop the current recording
   */
  public async stopRecording(): Promise<RecordingResult | null> {
    await this.lock.acquire();

    try {
      if (!this.recording || !this.conversationId) {
        console.warn("No active recording to stop");
        return null;
      }

      this.setStatus("stopping");

      // Stop duration tracking
      if (this.durationTimer) {
        clearInterval(this.durationTimer);
        this.durationTimer = null;
      }

      const duration = this.recordingDuration;
      this.recordingStartTime = null;

      // Get URI before stopping
      const tempUri = this.recording.getURI();
      if (!tempUri) {
        throw new Error("Recording URI is undefined");
      }

      try {
        await this.recording.stopAndUnloadAsync();

        // Keep a reference for later cleanup
        this.savedRecordings.push(this.recording);
        this.recording = null;
      } catch (error) {
        console.warn("Error stopping recording:", error);
        // Continue with saving if possible
      }

      // Determine partner prefix
      const partnerPrefix = `partner${this.currentPartner}`;

      // Save the recording to a permanent location
      const savedUri = await this.saveAudioRecording(
        tempUri,
        this.conversationId,
        partnerPrefix
      );

      // Update recordings list
      if (this.currentPartner === 1) {
        this.audioUris.partner1 = savedUri;
      } else {
        this.audioUris.partner2 = savedUri;
      }

      // Update state
      this.setStatus("stopped");

      // Prepare result
      const result: RecordingResult = {
        uri: savedUri,
        duration,
        partner: this.currentPartner,
      };

      // Emit recording complete event
      this.emit("recording-complete", result);

      // If in separate mode, switch to next partner
      if (this.recordingMode === "separate" && this.currentPartner === 1) {
        this.currentPartner = 2;
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to stop recording:", errorMsg);
      this.setStatus("failed");
      this.setError(`Failed to stop recording: ${errorMsg}`);
      return null;
    } finally {
      this.lock.release();
    }
  }

  /**
   * Upload recorded audio
   */
  public async uploadRecordings(
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    await this.lock.acquire();

    try {
      if (!this.conversationId) {
        this.setError("No conversation ID available");
        return false;
      }

      const isOnline = await networkService.isOnline();

      if (this.recordingMode === "live" && this.audioUris.partner1) {
        // Live mode - single recording
        if (isOnline) {
          await apiClient.uploadAudio(
            this.conversationId,
            this.audioUris.partner1,
            onProgress
          );
        } else {
          // Queue for offline upload
          await networkService.queueOfflineOperation(
            "upload_audio",
            {
              conversationId: this.conversationId,
              uris: [this.audioUris.partner1],
            },
            3 // High priority
          );
        }
      } else if (
        this.recordingMode === "separate" &&
        this.audioUris.partner1 &&
        this.audioUris.partner2
      ) {
        // Separate mode - two recordings
        if (isOnline) {
          await apiClient.uploadAudio(
            this.conversationId,
            [this.audioUris.partner1, this.audioUris.partner2],
            onProgress
          );
        } else {
          // Queue for offline upload
          await networkService.queueOfflineOperation(
            "upload_audio",
            {
              conversationId: this.conversationId,
              uris: [this.audioUris.partner1, this.audioUris.partner2],
            },
            3 // High priority
          );
        }
      } else {
        throw new Error("No recordings available to upload");
      }

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.setError(`Failed to upload recordings: ${errorMsg}`);
      return false;
    } finally {
      this.lock.release();
    }
  }

  /**
   * Handle offline upload when back online
   */
  private async handleOfflineUpload(data: Record<string, unknown>): Promise<void> {
    const conversationId = data.conversationId as string;
    const uris = data.uris as string[];

    if (!conversationId || !uris || !uris.length) {
      console.error("Invalid offline upload data:", data);
      return;
    }

    try {
      await apiClient.uploadAudio(conversationId, uris);
      console.log(`Successfully uploaded ${uris.length} files for conversation ${conversationId} after coming back online`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to upload recordings after coming back online: ${errorMsg}`);
      throw error; // Rethrow to allow retry
    }
  }

  /**
   * Start polling for results
   */
  public pollForResults(
    options: {
      onProgress?: (progress: number) => void;
      onComplete?: () => void;
      onError?: (error: Error) => void;
    } = {}
  ): () => void {
    if (!this.conversationId) {
      const error = new Error("No conversation ID available");
      if (options.onError) {
        options.onError(error);
      }
      this.setError("No conversation ID available");
      return () => {};
    }

    let stopPolling = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const checkStatus = async () => {
      if (stopPolling) return;

      try {
        const status = await apiClient.getConversationStatus(this.conversationId!);

        // Update progress
        if (status.progress !== undefined) {
          const progress = Math.round(status.progress * 100);
          this.updateProgress(progress);

          if (options.onProgress) {
            options.onProgress(progress);
          }
        }

        // Check if completed
        if (status.status === "completed") {
          try {
            await apiClient.getConversationResult(this.conversationId!);

            // Set final progress
            this.updateProgress(100);

            if (options.onProgress) {
              options.onProgress(100);
            }

            // Notify completion
            this.emit("processing-complete", this.conversationId!);

            if (options.onComplete) {
              options.onComplete();
            }

            // Stop polling
            stopPolling = true;
            if (pollInterval) {
              clearTimeout(pollInterval);
              pollInterval = null;
            }
          } catch (resultError) {
            const error = resultError instanceof Error
              ? resultError
              : new Error("Failed to fetch result");

            this.setError(`Failed to fetch result: ${error.message}`, {
              conversationId: this.conversationId!,
            });

            if (options.onError) {
              options.onError(error);
            }
          }
        } else if (status.status === "error") {
          // Handle error
          const errorMsg = status.error || "Processing failed";
          this.setError(errorMsg, { conversationId: this.conversationId! });

          if (options.onError) {
            options.onError(new Error(errorMsg));
          }

          // Stop polling
          stopPolling = true;
          if (pollInterval) {
            clearTimeout(pollInterval);
            pollInterval = null;
          }
        } else {
          // Continue polling
          pollInterval = setTimeout(checkStatus, 3000) as unknown as NodeJS.Timeout;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error polling for status: ${errorMsg}`);

        if (options.onError) {
          options.onError(error instanceof Error ? error : new Error(errorMsg));
        }

        // Continue polling despite errors, with longer delay
        pollInterval = setTimeout(checkStatus, 5000) as unknown as NodeJS.Timeout;
      }
    };

    // Start polling
    checkStatus();

    // Return function to stop polling
    return () => {
      stopPolling = true;
      if (pollInterval) {
        clearTimeout(pollInterval);
        pollInterval = null;
      }
    };
  }

  /**
   * Release all recording resources
   */
  public async releaseRecordings(): Promise<void> {
    await this.lock.acquire();

    try {
      // Prevent multiple release attempts
      if (this.isReleased) {
        console.log("Recordings already released, skipping");
        return;
      }

      // Set released flag immediately
      this.isReleased = true;

      // Stop current recording if active
      if (this.recording && this.recordingStatus === "recording") {
        try {
          await this.recording.stopAndUnloadAsync();
        } catch (error) {
          console.warn("Error stopping active recording during release:", error);
        }
        this.recording = null;
      }

      // Clear duration timer
      if (this.durationTimer) {
        clearInterval(this.durationTimer);
        this.durationTimer = null;
      }

      // Process saved recordings
      const recordings = [...this.savedRecordings];
      this.savedRecordings = [];

      for (const recording of recordings) {
        try {
          const uri = recording.getURI();
          if (uri) {
            await recording.stopAndUnloadAsync();
          }
        } catch (error) {
          console.warn("Error releasing saved recording:", error);
        }
      }

      // Reset state
      this.setStatus("idle");
      this.recordingDuration = 0;
      this.recordingStartTime = null;

      console.log("All recordings released successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error releasing recordings: ${errorMsg}`);
    } finally {
      this.lock.release();
    }
  }

  /**
   * Reset recording state
   */
  public reset(): void {
    this.currentPartner = 1;
    this.audioUris = {};
    this.processingProgress = 0;
    this.conversationId = null;
    this.error = null;
    this.setStatus("idle");
  }

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    await this.releaseRecordings();
    this.reset();

    // Clear listeners
    this.listeners.forEach((listenerSet) => listenerSet.clear());
  }

  /**
   * Get current recording status
   */
  public getStatus(): RecordingServiceStatus {
    return {
      status: this.recordingStatus,
      conversationId: this.conversationId,
      currentPartner: this.currentPartner,
      recordingMode: this.recordingMode,
      error: this.error
    };
  }

  /**
   * Set the recording mode
   */
  public setRecordingMode(mode: RecordingMode): void {
    this.recordingMode = mode;
  }

  /**
   * Switch to the next partner (for separate mode)
   */
  public switchPartner(): void {
    if (this.recordingMode === "separate") {
      this.currentPartner = this.currentPartner === 1 ? 2 : 1;
    }
  }
}

// Create and export singleton instance
export const recordingService = RecordingService.getInstance();