// server/src/api/routes/auth.routes.ts
import express, { Request, Response } from 'express';

const router = express.Router();

router.get('/session', (req: Request, res: Response) => {
  const { userId, sessionId } = req.auth || {};
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ userId, sessionId });
});

export default router;