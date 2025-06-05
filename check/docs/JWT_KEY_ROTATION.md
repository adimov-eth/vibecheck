# JWT Key Rotation System

## Overview

The JWT key rotation system provides automatic cryptographic key rotation for enhanced security. It supports zero-downtime key transitions, distributed environments, and maintains backward compatibility with existing tokens.

## Architecture

### Key Components

1. **JWT Key Service** (`src/services/jwt-key-service.ts`)
   - Manages key lifecycle (generation, storage, rotation, revocation)
   - Handles encryption/decryption of keys at rest
   - Provides distributed locking for safe concurrent operations

2. **Session Service** (`src/services/session-service.ts`)
   - Enhanced to support key-based token signing and verification
   - Maintains in-memory key cache with TTL
   - Falls back to legacy key for old tokens

3. **Admin API** (`src/api/routes/admin-jwt-routes.ts`)
   - List all keys with their status
   - Manually trigger key rotation
   - Revoke compromised keys

4. **Rotation Scheduler** (`src/scripts/jwt-key-rotation-scheduler.ts`)
   - Runs periodic checks for key rotation needs
   - Can be run as separate process or integrated

## Configuration

### Environment Variables

```bash
# Required
JWT_SECRET=your-current-jwt-secret  # Used for legacy tokens and key encryption

# Optional
JWT_ENCRYPTION_KEY=separate-encryption-key  # If you want different key for encryption
ADMIN_API_TOKEN=secure-admin-token  # For admin endpoints
```

### Configuration Options

```typescript
// src/config/jwt-config.ts
export const jwtKeyConfig = {
  rotation: {
    interval: 30 * 24 * 60 * 60 * 1000,    // 30 days
    gracePeriod: 7 * 24 * 60 * 60 * 1000,  // 7 days
    maxActiveKeys: 3,                       // Maximum concurrent keys
    checkInterval: 60 * 60 * 1000           // Check hourly
  },
  encryption: {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    iterations: 100000
  },
  storage: {
    keyPrefix: 'jwt:keys:',
    ttl: 45 * 24 * 60 * 60  // 45 days
  }
};
```

## Key Lifecycle

### 1. Initial Setup
- On first run, system registers the legacy JWT_SECRET
- Generates a new active signing key
- Both keys are available for verification

### 2. Active Phase (0-30 days)
- New tokens are signed with the active key
- Key ID (`kid`) is included in token header
- All active/rotating keys can verify tokens

### 3. Rotation Phase (Day 30)
- New key is generated and becomes active
- Previous key transitions to "rotating" status
- Both keys remain valid for verification

### 4. Grace Period (Days 30-37)
- Old tokens continue to work
- New tokens use the new key
- Monitoring tracks usage of old vs new keys

### 5. Expiration (Day 37+)
- Old key marked as expired
- Tokens signed with expired keys are rejected
- Key is eventually removed from storage

## Redis Storage Schema

```
jwt:keys:active_signing_key_id    # Current signing key ID
jwt:keys:all                      # Set of all key IDs
jwt:keys:{keyId}                  # Encrypted key data
jwt:keys:rotation:lock            # Distributed lock
jwt:keys:revoked                  # Set of revoked key IDs
jwt:key:updates                   # Pub/Sub channel for updates
```

## Security Features

### Encryption at Rest
- Keys stored encrypted using AES-256-GCM
- Encryption key derived from JWT_SECRET or JWT_ENCRYPTION_KEY
- Each key has unique IV and authentication tag

### Distributed Locking
- Prevents concurrent rotation attempts
- Uses Redis SET with NX and EX options
- 60-second timeout with automatic cleanup

### Key Revocation
- Immediate revocation via admin API
- Revoked keys added to blacklist
- All instances notified via pub/sub

### Audit Trail
- All key operations logged with timestamp
- Admin actions include IP address
- Rotation events published to monitoring

## API Endpoints

### List Keys
```bash
GET /admin/jwt/keys
X-Admin-Token: your-admin-token

Response:
{
  "success": true,
  "data": {
    "keys": [...],
    "currentSigningKeyId": "jwt-key-xxx",
    "totalKeys": 3,
    "activeKeys": 2
  }
}
```

### Rotate Keys
```bash
POST /admin/jwt/keys/rotate
X-Admin-Token: your-admin-token
Content-Type: application/json

{
  "force": true  // Force rotation even if not due
}
```

### Revoke Key
```bash
POST /admin/jwt/keys/revoke
X-Admin-Token: your-admin-token
Content-Type: application/json

{
  "keyId": "jwt-key-xxx"
}
```

## Operations

### Running the Rotation Scheduler

```bash
# As separate process
bun run jwt:rotate

# Or run once for testing
bun src/scripts/jwt-key-rotation-scheduler.ts
```

### Manual Key Rotation

```bash
# Check if rotation needed
curl -X POST http://localhost:3000/admin/jwt/keys/rotate \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'

# Force immediate rotation
curl -X POST http://localhost:3000/admin/jwt/keys/rotate \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Emergency Key Revocation

```bash
# List all keys first
curl http://localhost:3000/admin/jwt/keys \
  -H "X-Admin-Token: $ADMIN_TOKEN"

# Revoke specific key
curl -X POST http://localhost:3000/admin/jwt/keys/revoke \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "jwt-key-xxx"}'
```

## Monitoring

### Key Metrics
- Active key count
- Key age distribution
- Token verification by key ID
- Rotation success/failure rate

### Alerts to Configure
- No active keys available
- Rotation failure after retries
- Key approaching expiration
- High rate of verification failures

### Log Events
```
JWT key rotation completed { newKeyId, oldKeyId }
JWT key revoked by admin { keyId, adminIp }
Failed to rotate JWT keys { error }
```

## Migration Strategy

### Phase 1: Deploy with Legacy Support
1. Deploy new code with key rotation disabled
2. All existing tokens continue to work
3. Monitor for any issues

### Phase 2: Enable Key System
1. Set JWT_SECRET and ADMIN_API_TOKEN
2. System registers legacy key automatically
3. New tokens get key IDs

### Phase 3: Start Rotation
1. Enable rotation scheduler
2. Monitor token distribution
3. Track legacy vs new token usage

### Phase 4: Phase Out Legacy
1. After 60 days, legacy key expires
2. Monitor for any remaining legacy tokens
3. Extend grace period if needed

## Troubleshooting

### Common Issues

1. **"No active signing key found"**
   - Check Redis connection
   - Verify JWT_SECRET is set
   - Run initialization manually

2. **"Invalid token - key not found"**
   - Key may have been revoked
   - Check key exists in Redis
   - Verify Redis connectivity

3. **"Another instance is already rotating keys"**
   - Normal if multiple schedulers running
   - Check for stuck locks in Redis
   - Clear lock if necessary

### Debug Commands

```bash
# Check Redis keys
redis-cli keys "jwt:keys:*"

# View current signing key
redis-cli get jwt:keys:active_signing_key_id

# List all key IDs
redis-cli smembers jwt:keys:all

# Clear stuck lock (emergency only)
redis-cli del jwt:keys:rotation:lock
```

## Security Considerations

1. **Protect Admin Endpoints**: Use strong ADMIN_API_TOKEN
2. **Monitor Key Usage**: Track which keys are actively used
3. **Backup Keys**: Consider encrypted backup of keys
4. **HSM Integration**: For production, consider hardware security modules
5. **Audit Compliance**: Log all key operations for compliance

## Future Enhancements

1. **Asymmetric Keys**: Support for RS256/ES256
2. **Key Escrow**: Secure backup and recovery
3. **Metrics Dashboard**: Real-time key usage visualization
4. **Automated Alerts**: Integration with monitoring systems
5. **Compliance Reports**: Automated key rotation audit reports