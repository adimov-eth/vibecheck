import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PooledDatabase } from '../../database';
import { audioQueue } from '../../queues';
import {
  createAudioRecord,
  getAudioById,
  getConversationAudios,
  updateAudioStatus
} from '../../services/audio.service';
import { getConversationById } from '../../services/conversation.service';
import { uploadAudio } from '../../services/storage.service';
import { log } from '../../utils/logger.utils';

interface CustomRequest extends Request {
  userId?: string;
  db: PooledDatabase;
  file?: Express.Multer.File;
}

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['audio/webm', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/x-m4a'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only supported audio files are allowed (webm, wav, m4a). Received: ${file.mimetype}`));
    }
  },
});

const uploadAudioSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
});

router.post('/upload', upload.single('audio'), (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validationResult = uploadAudioSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        details: validationResult.error.errors 
      });
    }

    const { conversationId } = validationResult.data;

    const conversation = await getConversationById(conversationId, userId, req.db);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = req.file;
    const audioPath = await uploadAudio(audioFile);

    const audio = await createAudioRecord({
      conversationId,
      userId,
      audioFile: audioPath,
      db: req.db
    });

    await audioQueue.add('transcribe-audio', {
      audioId: audio.id,
      conversationId,
      audioPath
    });

    res.status(201).json({ audio });
  } catch (error) {
    log(`Error in upload audio endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

router.get('/:id', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const audio = await getAudioById(req.params.id, userId, req.db);
    if (!audio) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    res.status(200).json({ audio });
  } catch (error) {
    log(`Error in get audio endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

router.get('/conversation/:conversationId', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { conversationId } = req.params;

    const conversation = await getConversationById(conversationId, userId, req.db);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const audios = await getConversationAudios(conversationId, req.db);
    res.status(200).json({ audios });
  } catch (error) {
    log(`Error in get conversation audios endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

router.patch('/:id/status', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const audio = await getAudioById(req.params.id, userId, req.db);
    if (!audio) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    await updateAudioStatus(audio.id, status, req.db);
    res.status(200).json({ success: true });
  } catch (error) {
    log(`Error in update audio status endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

export default router;