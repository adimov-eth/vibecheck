import { NextFunction, Request, Response } from 'express';
import { getDbConnection, PooledDatabase } from '../../database';
import { logger } from '../../utils/logger.utils';

export const dbMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const db = getDbConnection();
    req.db = db;
    
    const releaseDb = () => {
      if (!db.released) {
        db.release();
        db.released = true;
        logger.debug('DB connection released');
      }
    };
    
    res.on('finish', releaseDb);
    res.on('close', releaseDb);
    
    next();
  } catch (error) {
    logger.error(`Error acquiring database connection: ${error}`);
    res.status(500).json({ error: 'Database connection error' });
  }
};

// Export PooledDatabase type for use in other files
export type { PooledDatabase };
