// src/errors.ts
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { log } from './utils/logger.utils';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  log(`Error: ${err.message}`, 'error');

  if (err instanceof ValidationError) {
    return res.status(400).json({ error: 'Bad Request', message: err.message });
  }
  if (err instanceof AuthenticationError) {
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: err.message });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: 'Not Found', message: err.message });
  }

  res
    .status(500)
    .json({ error: 'Internal Server Error', message: err.message });
};
