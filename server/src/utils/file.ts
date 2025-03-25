import { randomUUID } from 'crypto';
import fs from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, dirname, join, normalize, relative } from 'path';
import { config } from '../config';
import { logger } from './logger';

interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

// Validate file path to prevent path traversal
const validateFilePath = (filePath: string): FileValidationResult => {
  try {
    const normalizedPath = normalize(filePath);
    const relativePath = relative(config.uploadsDir, normalizedPath);
    
    if (relativePath.startsWith('..') || relativePath.includes('../')) {
      return {
        isValid: false,
        error: 'Path traversal detected'
      };
    }
    
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid file path: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

// Generate safe file name with UUID prefix
const generateSafeFileName = (originalName: string): string => {
  const uuid = randomUUID();
  const sanitizedName = basename(originalName).replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${uuid}-${sanitizedName}`;
};

// Save file to disk with enhanced security
export const saveFile = async (
  fileData: Buffer,
  fileName: string
): Promise<string> => {
  try {
    const safeFileName = generateSafeFileName(fileName);
    const filePath = join(config.uploadsDir, safeFileName);
    
    // Validate file path
    const validation = validateFilePath(filePath);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    
    // Write file
    await writeFile(filePath, fileData);
    
    logger.debug(`File saved: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error(`Failed to save file: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

// Delete file from disk with enhanced validation
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    // Validate file path before deletion
    const validation = validateFilePath(filePath);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    
    await unlink(filePath);
    logger.debug(`File deleted: ${filePath}`);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Get file age in hours
export const getFileAge = (filePath: string): number => {
  try {
    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs / (1000 * 60 * 60); // Convert to hours
  } catch {
    return Infinity; // If file doesn't exist or error, return Infinity
  }
};