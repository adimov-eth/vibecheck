import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';

export const errorHandler = (
  err: Error | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Ensure res and res.status are available
  if (!res || typeof res.status !== 'function') {
    console.error('Error handler received invalid response object');
    return next(err); // Pass to default Express error handler
  } // Log error, safely access message property
  const errorMessage = err && err.message ? err.message : 'Unknown error';
  log(`Error: ${errorMessage}`, 'error');
  try {
    // Safety check before using includes
    if (
      err &&
      err.message &&
      typeof err.message.includes === 'function' &&
      err.message.includes('validation')
    ) {
      return res
        .status(400)
        .json({ error: 'Bad Request', message: errorMessage });
    }

    if (err && err.name === 'ClerkError') {
      return res
        .status(401)
        .json({ error: 'Authentication failed', details: errorMessage });
    }

    res
      .status(500)
      .json({ error: 'Internal Server Error', message: errorMessage });
  } catch (handlingError) {
    console.error('Error in error handler:', handlingError);
    // Attempt to send a basic response if possible
    try {
      res.status(500).send('Internal Server Error');
    } catch (e) {
      // If all else fails, pass to Express's default error handler
      next(err);
    }
  }
};
