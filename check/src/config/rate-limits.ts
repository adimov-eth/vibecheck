export const rateLimitConfig = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: {
      perIP: 5,
      perEmail: 10,
      beforeCaptcha: 3,
      beforeLockout: 10
    },
    progressiveDelays: [0, 1000, 5000, 15000, 30000, 60000], // in milliseconds
    blockDuration: 15 * 60 * 1000, // 15 minutes
    captchaTTL: 5 * 60, // 5 minutes in seconds
  },
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // requests per window
  }
};