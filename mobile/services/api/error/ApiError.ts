export interface ApiErrorOptions {
  status?: number;
  code?: string;
  isAuthError?: boolean;
  isRateLimitError?: boolean;
  isNetworkError?: boolean;
  isServerError?: boolean;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  isAuthError: boolean;
  isRateLimitError: boolean;
  isNetworkError: boolean;
  isServerError: boolean;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.isAuthError = options.isAuthError || false;
    this.isRateLimitError = options.isRateLimitError || false;
    this.isNetworkError = options.isNetworkError || false;
    this.isServerError = options.isServerError || false;
  }

  static timeout(message = "Request timed out"): ApiError {
    return new ApiError(message, {
      isNetworkError: true,
      code: "REQUEST_TIMEOUT",
    });
  }

  static network(message = "Network request failed"): ApiError {
    return new ApiError(message, {
      isNetworkError: true,
      code: "NETWORK_ERROR",
    });
  }

  static auth(message = "Authentication failed"): ApiError {
    return new ApiError(message, {
      isAuthError: true,
      code: "AUTH_FAILED",
    });
  }

  static rateLimit(retryAfter?: number): ApiError {
    const message = retryAfter
      ? `Rate limit exceeded, retry after ${retryAfter} seconds`
      : "Rate limit exceeded";

    return new ApiError(message, {
      status: 429,
      isRateLimitError: true,
      code: "RATE_LIMIT_EXCEEDED",
    });
  }

  static server(status: number, message?: string): ApiError {
    return new ApiError(message || `Server error: ${status}`, {
      status,
      isServerError: true,
      code: "SERVER_ERROR",
    });
  }
}
