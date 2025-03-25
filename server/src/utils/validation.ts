import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { ValidationError } from '@/middleware/error';
import { logger } from './logger';
import { formatError } from './error-formatter';

/**
 * Location of data to validate
 */
export enum ValidateLocation {
  BODY = 'body',
  QUERY = 'query',
  PARAMS = 'params',
  HEADERS = 'headers'
}

/**
 * Options for validation
 */
interface ValidationOptions {
  /**
   * Location of the data to validate
   */
  location?: ValidateLocation | ValidateLocation[];
  
  /**
   * Whether to strip unknown fields
   */
  stripUnknown?: boolean;
}

/**
 * Create middleware to validate request data against a schema
 * 
 * @param schema The Zod schema to validate against
 * @param options Validation options
 * @returns Express middleware function
 */
export const validateRequest = (
  schema: ZodSchema,
  options: ValidationOptions = {}
) => {
  const locations = options.location 
    ? Array.isArray(options.location) 
      ? options.location 
      : [options.location] 
    : [ValidateLocation.BODY];
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate each specified location
      for (const location of locations) {
        const data = req[location as keyof Request];
        
        if (data) {
          const parseOptions = options.stripUnknown 
            ? { stripUnknown: true } 
            : undefined;
            
          // Parse and assign the validated data back to the request
          req[location as keyof Request] = await schema.parseAsync(data, parseOptions);
        }
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors for better readability
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        const errorMessage = formattedErrors
          .map(err => `${err.path}: ${err.message}`)
          .join('; ');
        
        logger.debug(`Validation error: ${errorMessage}`);
        
        // Use our ValidationError for consistent error handling
        next(new ValidationError(`Validation failed: ${errorMessage}`));
      } else {
        logger.error(`Unexpected validation error: ${formatError(error)}`);
        next(error);
      }
    }
  };
}; 

/**
 * Sanitize user input to prevent injection attacks
 * 
 * @param input The string to sanitize
 * @returns Sanitized string
 */
export const sanitizeInput = (input: string): string => {
  if (!input) return input;
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

/**
 * Helper to apply sanitization to all string fields in an object
 * 
 * @param obj The object to sanitize
 * @returns Sanitized object
 */
export const sanitizeObject = <T extends Record<string, any>>(obj: T): T => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = { ...obj };
  
  Object.keys(result).forEach(key => {
    const value = result[key];
    
    if (typeof value === 'string') {
      result[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    }
  });
  
  return result;
};