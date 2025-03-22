import { ApiError } from '../hooks/useAPI';
import { showToast } from './toast'; // Hypothetical toast utility
import { router } from 'expo-router';

/**
 * Handles API errors with appropriate UI feedback and actions
 * @param error The error to handle
 * @param options Options for customizing eкrror handling behavior
 */
export function handleApiError(error: unknown, options: {
  redirectOnAuthError?: boolean;
  showToast?: boolean;
  customMessages?: Record<string, string>;
  onRateLimit?: () => void;
  onNetworkError?: () => void;
  onAuthError?: () => void;
  onServerError?: () => void;
  onOtherError?: () => void;
} = {}) {
  const {
    redirectOnAuthError = true,
    showToast: shouldShowToast = true,
    customMessages = {},
    onRateLimit,
    onNetworkError,
    onAuthError,
    onServerError,
    onOtherError
  } = options;

  console.error('API Error:', error);

  // Default error message
  let title = 'Error';
  let message = 'An unexpected error occurred';

  if (error instanceof ApiError) {
    // Authentication errors
    if (error.isAuthError) {
      title = 'Authentication Error';
      message = customMessages.auth || 'Your session has expired. Please sign in again.';
      
      if (redirectOnAuthError) {
        // Wait a bit to show the toast before redirecting
        setTimeout(() => {
          router.replace('/(auth)/sign-in');
        }, 1500);
      }
      
      onAuthError?.();
    }
    // Rate limit errors
    else if (error.isRateLimitError) {
      title = 'Rate Limit';
      message = customMessages.rateLimit || 'You\'re making requests too quickly. Please wait and try again.';
      onRateLimit?.();
    }
    // Network errors
    else if (error.isNetworkError) {
      title = 'Network Error';
      message = customMessages.network || 'Please check your internet connection and try again.';
      onNetworkError?.();
    }
    // Server errors
    else if (error.isServerError) {
      title = 'Server Error';
      message = customMessages.server || 'Our servers are currently experiencing issues. Please try again later.';
      onServerError?.();
    }
    // Other API errors
    else {
      message = error.message || 'An error occurred with your request';
      onOtherError?.();
    }
  } else if (error instanceof Error) {
    message = error.message;
    onOtherError?.();
  }

  // Show toast notification if enabled
  if (shouldShowToast) {
    showToast.error(title, message);
  }

  return { title, message };
} 