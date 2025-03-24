/**
 * Logger service for structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  message: string;
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Log debug level messages (only in development)
   */
  debug(entry: LogEntry): void {
    if (this.isDevelopment) {
      this.log('debug', entry);
    }
  }

  /**
   * Log informational messages
   */
  info(entry: LogEntry): void {
    this.log('info', entry);
  }

  /**
   * Log warning messages
   */
  warn(entry: LogEntry): void {
    this.log('warn', entry);
  }

  /**
   * Log error messages
   */
  error(entry: LogEntry): void {
    this.log('error', entry);
  }

  /**
   * Internal logging implementation
   */
  private log(level: LogLevel, entry: LogEntry): void {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      ...entry
    };

    // In development, pretty print logs
    if (this.isDevelopment) {
      console[level](`[${timestamp}] ${level.toUpperCase()}: ${entry.message}`, {
        ...logData,
        message: undefined
      });
      return;
    }

    // In production, output structured JSON logs
    console[level](JSON.stringify(logData));
  }
}

export const logger = new Logger(); 