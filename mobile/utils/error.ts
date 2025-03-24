export type ErrorType =
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'RECORDING_ERROR'
  | 'WEBSOCKET_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

export type ErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface ErrorOptions {
  defaultMessage: string;
  serviceName: string;
  errorType: ErrorType;
  severity: ErrorSeverity;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error {
  type: ErrorType;
  severity: ErrorSeverity;
  serviceName: string;
  metadata?: Record<string, unknown>;

  constructor(message: string, options: ErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.type = options.errorType;
    this.severity = options.severity;
    this.serviceName = options.serviceName;
    this.metadata = options.metadata;
  }
}

export function handleError(error: unknown, options: ErrorOptions): AppError {
  // If it's already an AppError, just return it
  if (error instanceof AppError) {
    return error;
  }

  // If it's a standard Error, use its message
  if (error instanceof Error) {
    return new AppError(error.message, options);
  }

  // For unknown error types, use the default message
  return new AppError(options.defaultMessage, options);
} 