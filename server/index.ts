import { createApp } from './src/api/index.js';
import { config } from './src/config.js';
import fs from 'fs/promises';

async function ensureUploadsDir() {
  try {
    await fs.mkdir(config.uploadsDir, { recursive: true });
    console.log(`Uploads directory ensured at ${config.uploadsDir}`);
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
}
const app = createApp();
const PORT = config.port; // Initialize necessary directories before starting the server
ensureUploadsDir().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
