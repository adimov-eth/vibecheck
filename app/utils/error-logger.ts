/**
 * Error logging utilities for structured error handling
 * Provides consistent error formatting, categorization, and logging
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthError } from '../types/auth';

interface ApiError {
  /** Error code for more specific handling */
  code: string;
  /** Error message */
  message: string;
  /** HTTP status code if applicable */
  status?: number;
  /** Original error if available */
  originalError?: Error;
}

// API error class implementation
export class ApiErrorImpl implements ApiError {
  code: string;
  message: string;
  status?: number;
  originalError?: Error;

  constructor(code: string, message: string, status?: number, originalError?: Error) {
    this.code = code;
    this.message = message;
    this.status = status;
    this.originalError = originalError;
  }
}

// Error type guard for API errors
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

// Constants
const ERROR_LOG_KEY = 'error_logs';
const MAX_STORED_LOGS = 50;

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error category types
 */
export type ErrorCategory = 
  | 'auth' 
  | 'network' 
  | 'api' 
  | 'storage' 
  | 'ui' 
  | 'business_logic' 
  | 'unknown';

/**
 * Structured error log entry
 */
export interface ErrorLogEntry {
  /** Unique identifier for the error */
  id: string;
  /** When the error occurred */
  timestamp: number;
  /** Error message */
  message: string;
  /** Error category for grouping */
  category: ErrorCategory;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Error code if available */
  code?: string;
  /** Component or function where error occurred */
  source?: string;
  /** Additional context about the error */
  context?: Record<string, unknown>;
  /** Stack trace if available */
  stack?: string;
  /** App version when error occurred */
  appVersion?: string;
  /** OS information */
  platform?: {
    os: string;
    version: string;
  };
  /** Whether error was reported to monitoring service */
  reported?: boolean;
}

/**
 * Generate a unique ID for error logs
 * @returns Unique identifier string
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get app version information
 * @returns App version string
 */
function getAppVersion(): string {
  return Platform.OS === 'ios'
    ? Application.nativeApplicationVersion || 'unknown'
    : Application.nativeBuildVersion || 'unknown';
}

/**
 * Determine error category based on error type
 * @param error Error to categorize
 * @returns Error category
 */
function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof AuthError) {
    return 'auth';
  }
  
  if (error instanceof TypeError && error.message.includes('Network request failed')) {
    return 'network';
  }
  
  if (
    error instanceof Error && 
    (error.name === 'AbortError' || error.message.includes('timeout'))
  ) {
    return 'network';
  }
  
  // Check for storage errors
  if (
    error instanceof Error && 
    typeof error.message === 'string' &&
    (error.message.includes('storage') || error.message.includes('AsyncStorage'))
  ) {
    return 'storage';
  }
  
  // Check for API errors
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { isAxiosError?: boolean };
    if (errorObj.isAxiosError || isApiError(error)) {
    return 'api';
  }
  
  }
  return 'unknown';
}

/**
 * Determine error severity based on error type and message
 * @param error Error to evaluate
 * @param category Error category
 * @returns Error severity level
 */
function evaluateSeverity(error: unknown, category: ErrorCategory): ErrorSeverity {
  const errorMessage = error instanceof Error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  
  // Authentication errors that affect user session are critical
  if (
    category === 'auth' && 
    (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('revoked'))
  ) {
    return 'high';
  }
  
  // Network connectivity issues are medium severity
  if (category === 'network') {
    return 'medium';
  }
  
  // Storage errors can lead to data loss
  if (category === 'storage' && errorMessage.includes('write')) {
    return 'high';
  }
  
  // Default to low severity
  return 'low';
}

/**
 * Extract meaningful context from error objects
 * @param error Error to extract context from
 * @returns Context object
 */
function extractErrorContext(error: unknown): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  
  if (error instanceof Error) {
    // Include name and message
    context.name = error.name;
    context.message = error.message;
    
    // Include code if available
    if ('code' in error) {
      context.code = (error as { code: string }).code;
    }
    
    // Include status if available (for API errors)
    if ('status' in error) {
      context.status = (error as { status: number }).status;
    }
  }
  
  return context;
}

/**
 * Create a structured error log entry
 * @param error Error that occurred
 * @param source Component or function where error occurred
 * @param additionalContext Additional context to include
 * @returns Structured error log entry
 */
export function createErrorLog(
  error: unknown, 
  source?: string,
  additionalContext?: Record<string, unknown>
): ErrorLogEntry {
  // Determine error category
  const category = categorizeError(error);
  
  // Evaluate error severity
  const severity = evaluateSeverity(error, category);
  
  // Extract basic error information
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const code = error instanceof AuthError ? error.code : 
    (error instanceof ApiErrorImpl ? error.code : undefined);
  
  // Extract additional context
  const context = {
    ...extractErrorContext(error),
    ...additionalContext
  };
  
  // Create structured log entry
  return {
    id: generateErrorId(),
    timestamp: Date.now(),
    message,
    category,
    severity,
    code,
    source,
    context,
    stack,
    appVersion: getAppVersion(),
    platform: {
      os: Platform.OS,
      version: Platform.Version.toString()
    },
    reported: false
  };
}

/**
 * Log an error locally and to monitoring service if available
 * @param error Error to log
 * @param source Component or function where error occurred
 * @param additionalContext Additional context to include
 */
export async function logError(
  error: unknown,
  source?: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  try {
    // Create structured log entry
    const logEntry = createErrorLog(error, source, additionalContext);
    
    // Log to console for development
    if (__DEV__) {
      console.error(
        `[ERROR] [${logEntry.category}] [${logEntry.severity}] ${logEntry.source ? `[${logEntry.source}] ` : ''}${logEntry.message}`,
        logEntry
      );
    }
    
    // Store locally
    await storeErrorLog(logEntry);
    
    // TODO: Send to remote monitoring service
    // This would integrate with services like Sentry, Firebase Crashlytics, etc.
    
  } catch (loggingError) {
    // Fallback to simple console logging if structured logging fails
    console.error('Failed to log error:', loggingError);
    console.error('Original error:', error);
  }
}

/**
 * Store error log locally
 * @param logEntry Error log entry to store
 */
async function storeErrorLog(logEntry: ErrorLogEntry): Promise<void> {
  try {
    // Get existing logs
    const logsJson = await AsyncStorage.getItem(ERROR_LOG_KEY);
    const logs: ErrorLogEntry[] = logsJson ? JSON.parse(logsJson) : [];
    
    // Add new log
    logs.unshift(logEntry);
    
    // Limit size to prevent excessive storage usage
    const trimmedLogs = logs.slice(0, MAX_STORED_LOGS);
    
    // Save updated logs
    await AsyncStorage.setItem(ERROR_LOG_KEY, JSON.stringify(trimmedLogs));
  } catch (storageError) {
    console.error('Failed to store error log:', storageError);
  }
}

/**
 * Retrieve stored error logs
 * @returns Array of error log entries
 */
export async function getErrorLogs(): Promise<ErrorLogEntry[]> {
  try {
    const logsJson = await AsyncStorage.getItem(ERROR_LOG_KEY);
    return logsJson ? JSON.parse(logsJson) : [];
  } catch (error) {
    console.error('Failed to retrieve error logs:', error);
    return [];
  }
}

/**
 * Clear all stored error logs
 */
export async function clearErrorLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ERROR_LOG_KEY);
  } catch (error) {
    console.error('Failed to clear error logs:', error);
  }
}

/**
 * Check if an error should be shown to the user
 * @param logEntry Error log entry to evaluate
 * @returns Whether to display the error to the user
 */
export function shouldShowErrorToUser(logEntry: ErrorLogEntry): boolean {
  // Don't show low severity errors to users
  if (logEntry.severity === 'low') {
    return false;
  }
  
  // Always show critical errors
  if (logEntry.severity === 'critical') {
    return true;
  }
  
  // Show authentication errors that affect the user session
  if (logEntry.category === 'auth' && logEntry.severity === 'high') {
    return true;
  }
  
  // Show network errors only if they're persistent
  if (logEntry.category === 'network') {
    // Logic could check frequency of network errors here
    return true;
  }
  
  // Default to showing medium and high severity errors
  return ['medium', 'high'].includes(logEntry.severity);
}
