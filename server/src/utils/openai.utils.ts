import OpenAI from 'openai';
import { config } from '../config';
import { log } from './logger.utils';
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export const transcribeAudio = async (filePath: string): Promise<string> => {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const fileExtension = path.extname(filePath).toLowerCase().substring(1);
    const fileName = `audio.${fileExtension}`;
    const mimeType = getMimeType(fileExtension);

    const file = new File([fileBuffer], fileName, { type: mimeType });
    const response = await openai.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
    });
    return response.text;
  } catch (error) {
    log(
      `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    throw error;
  }
};

// Helper function to get the MIME type from file extension
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4', // m4a is handled as mp4 audio
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    oga: 'audio/ogg',
  };

  return mimeTypes[extension] || `audio/${extension}`;
}

export const generateGptResponse = async (prompt: string): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content || '';
  } catch (error) {
    log(
      `GPT failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    throw error;
  }
};
