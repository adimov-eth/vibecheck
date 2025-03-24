import { errorService, type ErrorSeverity, type ErrorType } from "@/services/ErrorService";
import { ApiError } from "@/services/api";

/**
 * Error handling options
 */
export interface ErrorOptions {
  defaultMessage?: string;
  serviceName?: string;
  showToast?: boolean;
  redirectToSignIn?: boolean;
  errorType?: ErrorType;
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
  onAuthError?: () => void;
  onNetworkError?: () => void;
  onRateLimitError?: () => void;
  onServerError?: () => void;
  onOtherError?: () => void;
}

/**
 * Get error title based on error type
 */
export function getErrorTitle(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isAuthError) return "Authentication Error";
    if (error.isNetworkError) return "Network Error";
    if (error.isRateLimitError) return "Too Many Requests";
    if (error.isServerError) return "Server Error";
  }
  
  return "Error";
}

/**
 * Get error message with fallback
 */
export function getErrorMessage(error: unknown, defaultMessage = "An unexpected error occurred"): string {
  if (error instanceof Error) {
    return error.message || defaultMessage;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  return defaultMessage;
}

/**
 * Centralized error handling utility
 */
export function handleError(
  error: unknown, 
  options: ErrorOptions = {}
): { title: string; message: string } {
  const {
    defaultMessage = "An unexpected error occurred",
    serviceName,
    showToast = true,
    redirectToSignIn = false,
    errorType = "UNKNOWN_ERROR",
    severity = "ERROR",
    metadata = {},
    onAuthError,
    onNetworkError,
    onRateLimitError,
    onServerError,
    onOtherError,
  } = options;
  
  // Standard error processing
  errorService.handleError(error, {
    defaultMessage,
    serviceName,
    showToast,
    errorType,
    severity,
    metadata,
  });
  
  let title = getErrorTitle(error);
  let message = getErrorMessage(error, defaultMessage);
  
  // Handle specific error types
  if (error instanceof ApiError) {
    if (error.isAuthError) {
      title = "Authentication Error";
      message = "Your session has expired. Please sign in again.";
      
      if (redirectToSignIn) {
        console.log("Redirecting to sign-in page");
      }
      
      if (onAuthError) onAuthError();
    } else if (error.isRateLimitError) {
      title = "Too Many Requests";
      message = "Please wait a moment before trying again.";
      
      if (onRateLimitError) onRateLimitError();
    } else if (error.isNetworkError) {
      title = "Network Error";
      message = "Please check your internet connection and try again.";
      
      if (onNetworkError) onNetworkError();
    } else if (error.isServerError) {
      title = "Server Error";
      message = "Our servers are currently experiencing issues. Please try again later.";
      
      if (onServerError) onServerError();
    } else {
      message = error.message;
      
      if (onOtherError) onOtherError();
    }
  } else if (error instanceof Error) {
    message = error.message;
    
    if (onOtherError) onOtherError();
  }
  
  return { title, message };
}