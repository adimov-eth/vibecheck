// src/utils/logger.utils.ts
import winston from 'winston';

// Get log level from environment or default to info
const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Log once what level we're using
logger.info(`Logger initialized with level: ${logLevel}`);

export const log = (message: string, level: 'info' | 'error' | 'warn' | 'debug' = 'info') => {
  logger.log({ level, message });
};
