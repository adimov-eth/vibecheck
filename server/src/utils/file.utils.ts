import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

export const saveFile = async (
  file: File,
  fileName: string
): Promise<string> => {
  const filePath = path.join(config.uploadsDir, fileName);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return filePath;
};

export const deleteFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath).catch(() => {}); // Ignore errors if file doesn't exist
};
