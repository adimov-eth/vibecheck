import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const status = err.status || 500;
  log(`Error: ${err.message}`, 'error');
  res.status(status).json({ error: err.name, message: err.message });
};