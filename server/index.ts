import { createApp } from './src/api/index.js';
import { config } from './src/config.js';
import fs from 'fs/promises';
import { logger } from './src/utils/logger.utils.js';
import { websocketManager } from './src/utils/websocket.utils.js';
import setupDatabase from './src/database/utils/setupDb.js';
import { shutdownDb } from './src/database/index.js';

// Main function to start the server
async function main() {
  try {
    // Set up database and run migrations
    logger.info('Setting up database...');
    const dbSuccess = await setupDatabase();
    if (!dbSuccess) {
      logger.error('Database setup failed, aborting server start');
      process.exit(1);
    }
    logger.info('Database setup completed successfully');
    
    // Create and configure the app
    const server = createApp();
    
    // Start the server
    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
const server = await main();

async function shutdown() {
  logger.info('Shutdown signal received, closing server...');
  
  // Close the HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Shutdown WebSocket server if it's running
    websocketManager.shutdown();
    
    // Close database connections
    shutdownDb()
      .then(() => logger.info('Database connections closed'))
      .catch(err => logger.error('Error closing database connections:', err))
      .finally(() => {
        // Exit process
        logger.info('Server shutdown complete');
        process.exit(0);
      });
  });
  
  // Force exit after timeout if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
