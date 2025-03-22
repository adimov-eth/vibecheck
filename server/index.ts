import { createApp } from './src/api/index.js';
import { config } from './src/config.js';
import fs from 'fs/promises';
import { logger } from './src/utils/logger.utils.js';
import { websocketManager } from './src/utils/websocket.utils.js';

/**
 * Ensure required directories exist before starting the server
 */
async function ensureDirectories() {
  try {
    // Ensure uploads directory exists
    await fs.mkdir(config.uploadsDir, { recursive: true });
    logger.info(`Uploads directory ensured at ${config.uploadsDir}`);
  } catch (error) {
    logger.error('Failed to create required directories:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(server) {
  const shutdown = () => {
    logger.info('Shutdown signal received, closing server...');
    
    // Close the HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Shutdown WebSocket server if it's running
      websocketManager.shutdown();
      
      // Exit process
      logger.info('Server shutdown complete');
      process.exit(0);
    });
    
    // Force exit after timeout if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };
  
  // Listen for shutdown signals
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown();
  });
}

// Main function to start the server
async function main() {
  try {
    // Ensure required directories exist
    await ensureDirectories();
    
    // Create and configure the app
    const server = createApp();
    const PORT = config.port;
    
    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`WebSocket ${config.webSocket.enabled ? 'enabled' : 'disabled'}`);
    });
    
    // Setup graceful shutdown
    setupGracefulShutdown(server);
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
main();
