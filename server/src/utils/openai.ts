import { readFile } from 'fs/promises';
import OpenAI from 'openai';
import { config } from '../config';
import { logger } from './logger';
import { formatError } from './error-formatter';
import { ExternalServiceError } from '@/middleware/error';
import { Result } from '@/types/common';

// Initialize OpenAI client with retry logic
const openai = new OpenAI({ 
  apiKey: config.openaiApiKey,
  maxRetries: 3,
  timeout: 30000
});

/**
 * Map of file extensions to MIME types
 */
const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

/**
 * Get MIME type from file extension
 * @param extension The file extension
 * @returns The corresponding MIME type
 */
const getMimeType = (extension: string): string => {
  return MIME_TYPES[extension] || `audio/${extension}`;
};

/**
 * Transcribe audio file using OpenAI's API
 * @param filePath Path to the audio file
 * @returns The transcribed text or an error
 */
export const transcribeAudio = async (filePath: string): Promise<string> => {
  try {
    logger.info(`Transcribing audio file: ${filePath}`);
    
    // Read the file
    const fileBuffer = await readFile(filePath);
      
    if (fileBuffer.length === 0) {
      throw new Error(`Audio file is empty: ${filePath}`);
    }
    
    logger.info(`Successfully read audio file: ${filePath} (${fileBuffer.length} bytes)`);
    
    const fileExtension = filePath.split('.').pop()?.toLowerCase() || 'webm';
    const fileName = `audio.${fileExtension}`;
    const mimeType = getMimeType(fileExtension);
    
    // Validate file size
    const fileSizeInMB = fileBuffer.length / (1024 * 1024);
    if (fileSizeInMB > 25) {
      logger.warn(`Audio file too large (${fileSizeInMB.toFixed(2)}MB), maximum size is 25MB`);
      throw new Error('Audio file exceeds maximum size of 25MB');
    }
    
    const file = new File([fileBuffer], fileName, { type: mimeType });
    
    // Add timeout and retry logic
    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'text',
      temperature: 0.2, // Lower temperature for more accurate transcription
    });
    
    if (!response.text) {
      throw new Error('OpenAI returned empty transcription');
    }
    
    logger.info(`Transcription completed for ${filePath}: ${response.text.substring(0, 50)}...`);
    return response.text;
  } catch (error) {
    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      logger.error(`OpenAI API Error (${error.status}): ${error.message}`);
      throw new Error(`Transcription failed: ${error.message}`);
    }
    
    logger.error(`Transcription failed: ${formatError(error)}`);
    throw error;
  }
};

/**
 * Generate a response using GPT
 * @param prompt The prompt to send to GPT
 * @returns The generated response or an error
 */
export const generateGptResponse = async (prompt: string): Promise<Result<string>> => {
  try {
    if (!prompt || prompt.trim().length === 0) {
      return {
        success: false,
        error: new Error('Empty prompt provided to GPT')
      };
    }
    
    logger.info('Generating GPT response');
    
    // Add system message for better contextual understanding
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful assistant analyzing audio recordings. Provide insightful, constructive feedback.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    const content = response.choices[0].message.content;
    
    if (!content) {
      logger.warn('GPT returned empty response');
      return {
        success: false,
        error: new ExternalServiceError('Empty response from GPT', 'OpenAI')
      };
    }
    
    logger.info('GPT response generated successfully');
    return { success: true, data: content };
  } catch (error) {
    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      logger.error(`OpenAI API Error (${error.status}): ${error.message}`);
      return {
        success: false,
        error: new ExternalServiceError(
          `GPT response generation failed: ${error.message}`,
          'OpenAI'
        )
      };
    }
    
    logger.error(`GPT response generation failed: ${formatError(error)}`);
    return {
      success: false,
      error: new ExternalServiceError('Failed to generate GPT response', 'OpenAI')
    };
  }
};