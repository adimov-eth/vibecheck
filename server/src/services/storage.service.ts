// /Users/adimov/Developer/vibecheck/server/src/services/storage.service.ts
import path from 'path';
import { saveFile } from '../utils/file.utils';
import { log } from '../utils/logger.utils';

export async function uploadAudio(audioFile: Express.Multer.File): Promise<string> {
  try {
    const fileName = `audio-${Date.now()}${path.extname(audioFile.originalname)}`;
    const filePath = await saveFile(audioFile.buffer, fileName);
    log(`Audio uploaded successfully to ${filePath}`);
    return filePath;
  } catch (error) {
    log(`Error uploading audio: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}