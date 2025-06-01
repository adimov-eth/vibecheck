import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, normalize, relative } from 'node:path';
import { config } from '../config';
import { log } from './logger';

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
    try {
      await mkdir(config.uploadsDir, { recursive: true });
      log.debug(`Uploads directory ensured: ${config.uploadsDir}`);
    } catch (dirError) {
      log.error(`Failed to create uploads directory: ${dirError instanceof Error ? dirError.message : String(dirError)}`);
      throw dirError;
    }
    
    // Write file
    try {
      await writeFile(filePath, fileData);
      
      // Verify file exists after writing
      const stats = fs.statSync(filePath);
      if (stats.size !== fileData.length) {
        throw new Error(`File size mismatch after writing. Expected: ${fileData.length}, Got: ${stats.size}`);
      }
      
      log.debug(`File saved successfully: ${filePath} (${stats.size} bytes)`);
      return filePath;
    } catch (writeError) {
      log.error(`Failed to write file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
      throw writeError;
    }
  } catch (error) {
    log.error(`Failed to save file: ${error instanceof Error ? error.message : String(error)}`);
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
    log.debug(`File deleted: ${filePath}`);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn(`Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
    return Number.POSITIVE_INFINITY; // If file doesn't exist or error, return Infinity
  }
};