import { config } from '@/config';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ErrorCode } from '@/types/common';

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
    statusCode: number = 500,
    isOperational: boolean = true
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
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log all errors
  logger.error(`Error: ${err.message}`);
  
  if (err.stack) {
    logger.debug(err.stack);
  }

  // Handle AppErrors
  if (err instanceof AppError) {
    const { statusCode, code, message, isOperational } = err;
    
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
  if (err.name === 'SyntaxError' || (err as any).type === 'entity.parse.failed') {
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
    message: config.nodeEnv === 'production' ? 'An unexpected error occurred' : err.message 
  });
};