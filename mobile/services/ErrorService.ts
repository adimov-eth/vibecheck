import { eventBus } from "./EventBus";
import { queryClient } from "./QueryClient";

/**
 * Standard error types for consistent error handling
 */
export type ErrorType = 
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "UPLOAD_ERROR"
  | "RECORDING_ERROR"
  | "WEBSOCKET_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Standard error severity levels
 */
export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

/**
 * Base error options interface
 */
export interface BaseErrorOptions {
  defaultMessage?: string;
  serviceName?: string;
  showToast?: boolean;
  severity?: ErrorSeverity;
  errorType?: ErrorType;
  metadata?: Record<string, unknown>;
  onError?: (error: string) => void;
}

/**
 * Recording specific error options
 */
export interface RecordingErrorOptions extends BaseErrorOptions {
  conversationId?: string;
  emitter?: { emit: (event: string, data: unknown) => void };
  updateStore?: boolean;
  updateQueryCache?: boolean;
}

/**
 * Centralized error management service
 */
export class ErrorService {
  private static instance: ErrorService;

  /**
   * Get the ErrorService singleton instance
   */
  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Handle recording or conversation errors
   */
  public handleRecordingError(
    errorMessage: string,
    options: RecordingErrorOptions = {},
  ): void {
    const {
      conversationId,
      emitter,
      updateStore = true,
      updateQueryCache = true,
      showToast = true,
      severity = "ERROR",
      errorType = "RECORDING_ERROR",
      metadata = {},
    } = options;

    // Log the error with metadata
    console.error(
      `[${severity}] ${errorType}: ${conversationId ? `Conversation ${conversationId}` : "Recording"} failed:`,
      {
        message: errorMessage,
        metadata,
      }
    );

    // Update React Query cache if conversation ID provided
    if (updateQueryCache && conversationId) {
      queryClient.setQueryData(["conversation", conversationId, "status"], {
        status: "error",
        error: errorMessage,
      });
    }

    // Emit error event if emitter provided
    if (emitter) {
      emitter.emit("error", errorMessage);
    }

    // Set error in store via EventBus
    if (updateStore) {
      eventBus.emit("recording:error", errorMessage);
    }

    // Show toast if enabled
    if (showToast) {
      this.showErrorToast(errorMessage, severity);
    }
  }

  /**
   * Generic error handler with enhanced features
   */
  public handleError(
    error: unknown,
    options: BaseErrorOptions = {},
  ): { message: string; type: ErrorType; severity: ErrorSeverity } {
    const {
      defaultMessage = "An unexpected error occurred",
      serviceName,
      showToast = true,
      severity = "ERROR",
      errorType = "UNKNOWN_ERROR",
      metadata = {},
      onError,
    } = options;

    // Extract error message
    const errorMessage = this.extractErrorMessage(error, defaultMessage);

    // Log error with metadata
    const logPrefix = serviceName ? `[${serviceName}]` : `[${severity}] ${errorType}`;
    console.error(`${logPrefix}:`, {
      error,
      metadata,
    });

    // Show toast if enabled
    if (showToast) {
      this.showErrorToast(errorMessage, severity);
    }

    // Call optional callback
    if (onError) {
      onError(errorMessage);
    }

    return { 
      message: errorMessage,
      type: errorType,
      severity,
    };
  }

  /**
   * Extract error message from different error types
   */
  private extractErrorMessage(error: unknown, defaultMessage: string): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    if (typeof error === "object" && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if ("message" in errorObj && typeof errorObj.message === "string") {
        return errorObj.message;
      }
    }
    return defaultMessage;
  }

  /**
   * Show error toast with appropriate styling based on severity
   */
  private showErrorToast(message: string, severity: ErrorSeverity): void {
    // In a real app, this would integrate with your toast library
    console.log(`[Toast][${severity}] ${message}`);
  }
}

// Export singleton instance
export const errorService = ErrorService.getInstance();

// Export a convenience function for handling errors
export const handleError = (error: unknown, options: BaseErrorOptions = {}) => {
  return errorService.handleError(error, options);
};
