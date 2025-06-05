import { config } from '@/config';
import { ErrorCode } from '@/types/common';
import type { Request, Response } from 'express';
import { log } from '../utils/logger';

interface ExpressError extends Error {
  type?: string;
}

/**
 * Base class for application errors
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  
  constructor(
    message: string, 
    code: ErrorCode = ErrorCode.SERVER_ERROR,
    statusCode = 500,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - thrown when request data is invalid
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.VALIDATION, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error - thrown when user is not authenticated
 */
export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.AUTHENTICATION, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error - thrown when user lacks permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.AUTHORIZATION, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error - thrown when a resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.NOT_FOUND, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error - thrown when request rate exceeds limits
 */
export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, ErrorCode.RATE_LIMIT, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * External service error - thrown when an external API fails
 */
export class ExternalServiceError extends AppError {
  constructor(message: string, serviceName?: string) {
    super(
      serviceName ? `${serviceName} service error: ${message}` : message,
      ErrorCode.EXTERNAL_SERVICE,
      503
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Global error handler middleware
 */
export const handleError = (
  err: Error | unknown,
  _req: Request,
  res: Response,
  // _next: NextFunction
): Response | void => {
  // Check if response has already been sent
  if (res.headersSent) {
    log.error("Error occurred after response was sent", { error: err });
    return;
  }
  // Ensure err is an Error object
  const error = err instanceof Error ? err : new Error(String(err));
  
  // Log all errors
  log.error("Error handler called", { 
    message: error.message, 
    name: error.name, 
    isAppError: error instanceof AppError,
    stack: (config.nodeEnv !== 'production' ? error.stack : undefined) // Only include stack in non-prod
  });
  
  // Handle AppErrors
  if (error instanceof AppError) {
    const { statusCode, code, message, isOperational } = error;
    
    // Only show error details in non-production environments or for operational errors
    const errorMessage = (!isOperational && config.nodeEnv === 'production') 
      ? 'An unexpected error occurred' 
      : message;
    
    return res.status(statusCode).json({ 
      success: false,
      error: code, 
      message: errorMessage 
    });
  }

  // Handle Express validation errors
  if (error.name === 'SyntaxError' || (error as ExpressError).type === 'entity.parse.failed') {
    return res.status(400).json({ 
      success: false,
      error: ErrorCode.VALIDATION, 
      message: 'Invalid JSON in request body' 
    });
  }

  // Handle unknown errors
  return res.status(500).json({ 
    success: false,
    error: ErrorCode.SERVER_ERROR, 
    message: config.nodeEnv === 'production' ? 'An unexpected error occurred' : error.message 
  });
};