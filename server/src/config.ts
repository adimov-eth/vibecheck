console.log('process.env.CLERK_SECRET_KEY: ', process.env.CLERK_SECRET_KEY);
export const config = {
  port: Number(process.env.PORT) || 3000,
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  uploadsDir: './uploads',
};
