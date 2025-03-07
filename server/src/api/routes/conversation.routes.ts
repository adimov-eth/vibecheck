import express from 'express';
import { db } from '../../database';
import { conversations } from '../../database/schema';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';

const router = express.Router();
router.post('/', async (req, res, next) => {
  try {
    const { mode, recordingType } = req.body;
    const allowedModes = ['mediator', 'counselor', 'dinner', 'movie'];
    const allowedRecordingTypes = ['separate', 'live'];

    if (!mode || !allowedModes.includes(mode)) {
      return res
        .status(400)
        .json({ error: 'Invalid or missing conversation mode' });
    }
    if (!recordingType || !allowedRecordingTypes.includes(recordingType)) {
      return res
        .status(400)
        .json({ error: 'Invalid or missing recording type' });
    }

    const conversationId = uuid();
    await db.insert(conversations).values({
      id: conversationId,
      mode,
      recordingType,
      status: 'waiting',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json({ conversationId });
  } catch (error) {
    next(error);
  }
});
router.get('/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const conversation = result[0];
    if (!conversation)
      return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});
export default router;
