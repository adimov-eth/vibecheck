import express from 'express';
import { db } from '../../database';
import { conversations } from '../../database/schema';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { id, mode, recordingType } = req.body;
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

    // Generate a new ID if not provided or check if the provided ID already exists
    let conversationId = id || uuid();

    if (id) {
      // Check if conversation with this ID already exists
      const existingConversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .then(r => r[0]);

      if (existingConversation) {
        // If conversation exists, either return it or generate a new ID
        if (
          existingConversation.status === 'waiting' &&
          existingConversation.mode === mode &&
          existingConversation.recordingType === recordingType
        ) {
          // If it's the same parameters, return the existing conversation ID
          return res.status(200).json({
            conversationId: id,
            note: 'Using existing conversation with this ID',
          });
        } else {
          // Different parameters, generate a new ID instead
          conversationId = uuid();
        }
      }
    }

    // Insert the new conversation
    await db.insert(conversations).values({
      id: conversationId,
      mode,
      recordingType,
      status: 'waiting',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json({ conversationId });
  } catch (error: any) {
    console.error('Conversation creation error:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      // If we still somehow hit a unique constraint, generate a new ID and try again
      const newId = uuid();
      const { mode, recordingType } = req.body;
      try {
        await db.insert(conversations).values({
          id: newId,
          mode,
          recordingType,
          status: 'waiting',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return res.status(201).json({
          conversationId: newId,
          note: 'Generated new ID due to conflict',
        });
      } catch (retryError) {
        return next(retryError);
      }
    }
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
