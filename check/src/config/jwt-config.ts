export const jwtKeyConfig = {
  rotation: {
    interval: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    gracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    maxActiveKeys: 3,
    checkInterval: 60 * 60 * 1000 // Check hourly
  },
  encryption: {
    algorithm: 'aes-256-gcm' as const,
    keyDerivation: 'pbkdf2' as const,
    iterations: 100000,
    saltLength: 32,
    ivLength: 16,
    tagLength: 16
  },
  storage: {
    keyPrefix: 'jwt:keys:',
    ttl: 45 * 24 * 60 * 60 // 45 days in seconds
  }
};

// Redis key constants
export const JWT_REDIS_KEYS = {
  ACTIVE_SIGNING_KEY: 'jwt:keys:active_signing_key_id',
  ALL_KEYS: 'jwt:keys:all',
  KEY_PREFIX: 'jwt:keys:',
  ROTATION_LOCK: 'jwt:keys:rotation:lock',
  REVOKED_KEYS: 'jwt:keys:revoked',
  PUBSUB_CHANNEL: 'jwt:key:updates'
} as const;