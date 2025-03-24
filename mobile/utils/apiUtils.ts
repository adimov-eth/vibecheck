import { handleError, type ErrorOptions } from "./errorUtils";

/**
 * Export the centralized error handling utility
 */
export { handleError };
export type { ErrorOptions };

/**
 * Error handler for API errors (for backward compatibility)
 * @param error Error object
 * @param options Options for customizing error handling
 */
export const handleApiError = (
  error: unknown,
  options: {
    showToast?: boolean;
    redirectToSignIn?: boolean;
    onAuthError?: () => void;
    onNetworkError?: () => void;
    onRateLimitError?: () => void;
    onServerError?: () => void;
    onOtherError?: () => void;
  } = {},
): { title: string; message: string } => {
  // Map the old options format to the new ErrorOptions format
  const errorOptions: ErrorOptions = {
    defaultMessage: "An unexpected error occurred",
    serviceName: "API",
    showToast: options.showToast,
    redirectToSignIn: options.redirectToSignIn,
    onAuthError: options.onAuthError,
    onNetworkError: options.onNetworkError,
    onRateLimitError: options.onRateLimitError,
    onServerError: options.onServerError,
    onOtherError: options.onOtherError,
  };

  // Use the new centralized error handler
  return handleError(error, errorOptions);
};
