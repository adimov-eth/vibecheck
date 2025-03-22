import express, { Request, RequestHandler, Response } from 'express';
import { ConversationService } from '../../services/conversation.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authMiddleware as RequestHandler);

router.post('/',(async (req: Request, res: Response) => {
  const conversationService = new ConversationService(req.db);
  const { mode, recordingType } = req.body;
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = await conversationService.createConversation(userId, mode, recordingType);
  res.status(201).json({ conversationId: id });
}) as RequestHandler);

router.get('/:conversationId',(async (req: Request, res: Response) => {
  const conversationService = new ConversationService(req.db);
  const conversation = await conversationService.getConversation(req.params.conversationId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  res.json(conversation);
}) as RequestHandler);

export default router;