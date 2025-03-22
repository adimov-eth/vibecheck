console.log('process.env.CLERK_SECRET_KEY: ', process.env.CLERK_SECRET_KEY);
export const config = {
  port: Number(process.env.PORT) || 3000,
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  appleSharedSecret: process.env.APPLE_SHARED_SECRET || '',
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
};
