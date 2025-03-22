import { Request, Response, NextFunction } from 'express';
import { getDbConnection } from '../../database';
import { logger } from '../../utils/logger.utils';

export const dbMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const db = getDbConnection();
    req.db = db;
    
    // Release on both finish and close to cover all cases
    const releaseDb = () => {
      if (!db.released) { // Prevent double release
        db.release();
        db.released = true; // Custom flag to track release
        logger.debug('DB connection released');
      }
    };
    
    res.on('finish', releaseDb);
    res.on('close', releaseDb);  // Also handle aborted requests
    
    next();
  } catch (error) {
    logger.error(`Error acquiring database connection: ${error}`);
    res.status(500).json({ error: 'Database connection error' });
  }
}; 