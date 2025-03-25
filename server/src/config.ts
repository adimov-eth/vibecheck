export const config = {
  port: Number(process.env.PORT) || 3000,
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  appleSharedSecret: process.env.APPLE_SHARED_SECRET || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  uploadsDir: './uploads',
  
  // WebSocket configuration
  webSocket: {
    enabled: process.env.ENABLE_WEBSOCKET !== 'false',
    path: '/ws',
    pingInterval: 30000, // 30 seconds
  },
  
  // Rate limiting configuration
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequestsPerWindow: {
      default: 100,
      auth: 20,
      conversations: 60,
      audio: 30,
      subscriptions: 20,
      usage: 30,
      users: 30,
    },
    message: 'Too many requests, please try again later',
  },
  
  // Database maintenance configuration
  enableMaintenance: process.env.ENABLE_MAINTENANCE !== 'false',
  maintenanceHour: Number(process.env.MAINTENANCE_HOUR) || 3, // 3 AM
};

// Log Clerk secret key presence for debugging (avoid logging the actual value in production)
console.log('Clerk secret key present:', !!process.env.CLERK_SECRET_KEY);
console.log('Clerk webhook secret present:', !!process.env.CLERK_WEBHOOK_SECRET);