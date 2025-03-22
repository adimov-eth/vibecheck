import { createApp } from './src/api/index.js';
import { config } from './src/config.js';
import fs from 'fs/promises';
import { logger } from './src/utils/logger.utils.js';
import { websocketManager } from './src/utils/websocket.utils.js';
import setupDatabase from './src/database/utils/setupDb.js';
import { closeDbConnections } from './src/database/index.js';
import initScheduledMaintenance from './src/utils/scheduled-maintenance.js';

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
  const shutdown = async () => {
    logger.info('Shutdown signal received, closing server...');
    
    // Close the HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
      
      // Shutdown WebSocket server if it's running
      websocketManager.shutdown();
      
      // Close database connections
      closeDbConnections()
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
    const PORT = config.port;
    
    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`WebSocket ${config.webSocket.enabled ? 'enabled' : 'disabled'}`);
      
      // Initialize scheduled maintenance tasks
      if (config.enableMaintenance !== false) {
        initScheduledMaintenance();
      }
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
