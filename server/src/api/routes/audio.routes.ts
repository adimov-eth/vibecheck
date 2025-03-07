import express, {
  Request as ExpressRequest,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import { clerkClient, requireAuth, getAuth } from '@clerk/express';
import multer from 'multer';
import { db } from '../../database';
import { audios, conversations } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { saveFile } from '../../utils/file.utils';
import { audioQueue } from '../../queues';
import { log } from '../../utils/logger.utils';

interface CustomRequest extends ExpressRequest {
  userId?: string;
  file?: Express.Multer.File;
}

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'audio/webm',
      'audio/wav',
      'audio/m4a',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only supported audio files are allowed (webm, wav, m4a). Received: ${file.mimetype}`
        )
      );
    }
  },
});

// routes/audio.ts
router.post(
  '/',
  upload.single('audio') as unknown as RequestHandler,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      console.log('Audio upload endpoint hit');
      const auth = getAuth(req);
      const { conversationId } = req.body;
      const userId = auth?.userId;
      const audioFile = req.file;

      // Comprehensive authentication debug log
      console.log({
        path: req.path,
        auth: !!auth,
        userId,
        hasAuthHeader: !!req.headers.authorization,
        conversationId,
        hasFile: !!audioFile,
      });

      if (!userId) {
        console.log('Unauthorized request - missing userId');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!audioFile) {
        console.log('Missing audio file');
        return res.status(400).json({ error: 'Audio file required' });
      }

      if (!conversationId) {
        console.log('Missing conversation ID');
        return res.status(400).json({ error: 'Conversation ID required' });
      }

      // Get the conversation to validate it exists
      console.log(`Checking for conversation with ID: ${conversationId}`);
      const conversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .then(r => r[0]);
      if (!conversation) {
        console.log(`Conversation not found with ID: ${conversationId}`);
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const maxAudios = conversation.recordingType === 'separate' ? 2 : 1;
      const audioCount = await db
        .select()
        .from(audios)
        .where(eq(audios.conversationId, conversationId))
        .then(r => r.length);
      if (audioCount >= maxAudios) {
        return res
          .status(400)
          .json({ error: `Conversation already has ${maxAudios} audio(s)` });
      }

      // Determine file extension based on mimetype
      let fileExtension = '.webm';
      if (audioFile.mimetype === 'audio/wav') {
        fileExtension = '.wav';
      } else if (
        ['audio/m4a', 'audio/mp4', 'audio/x-m4a'].includes(audioFile.mimetype)
      ) {
        fileExtension = '.m4a';
      }

      const fileName = `${uuid()}${fileExtension}`;
      const filePath = await saveFile(
        new File([audioFile.buffer], fileName, { type: audioFile.mimetype }),
        fileName
      );

      const [newAudio] = await db
        .insert(audios)
        .values({
          conversationId,
          userId,
          audioFile: filePath,
          status: 'uploaded',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await audioQueue.add('process_audio', { audioId: newAudio.id });

      res
        .status(202)
        .json({ message: 'Audio uploaded and queued', audioId: newAudio.id });
    } catch (error) {
      log(
        `Audio upload failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      // Pass to error handler instead of handling here
      next(error);
    }
  }
);
export default router;
