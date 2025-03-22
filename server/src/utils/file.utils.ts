import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

export const saveFile = async (
  fileData: File | Buffer,
  fileName: string
): Promise<string> => {
  const filePath = path.join(config.uploadsDir, fileName);
  
  if (Buffer.isBuffer(fileData)) {
    // Handle Node.js Buffer directly
    await fs.writeFile(filePath, fileData);
  } else {
    // Handle browser File object
    await fs.writeFile(filePath, Buffer.from(await fileData.arrayBuffer()));
  }
  
  return filePath;
};

export const deleteFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath).catch(() => {}); // Ignore errors if file doesn't exist
};
