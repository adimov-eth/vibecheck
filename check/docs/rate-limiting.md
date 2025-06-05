# Rate Limiting Documentation

## Overview

VibeCheck implements a comprehensive rate limiting system to protect authentication endpoints from brute force attacks, credential stuffing, and other malicious activities.

## Configuration

All rate limiting configuration is centralized in `/src/config/rate-limits.ts`:

```typescript
{
  auth: {
    windowMs: 15 * 60 * 1000,        // 15 minutes
    maxAttempts: {
      perIP: 5,                      // 5 attempts per IP per window
      perEmail: 10,                  // 10 attempts per email per hour
      beforeCaptcha: 3,              // Show CAPTCHA after 3 failures
      beforeLockout: 10              // Lock account after 10 failures
    },
    progressiveDelays: [0, 1000, 5000, 15000, 30000, 60000], // ms
    blockDuration: 15 * 60 * 1000,   // 15 minutes
    captchaTTL: 5 * 60,              // 5 minutes
  }
}
```

## Rate Limiting Strategies

### 1. IP-Based Rate Limiting
- Limits authentication attempts from a single IP address
- 5 attempts allowed per 15-minute window
- Blocks IP for 15 minutes after exceeding limit
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### 2. Email-Based Rate Limiting
- Limits attempts per email address (prevents targeted attacks)
- 10 attempts allowed per hour
- Protects against credential stuffing
- Does not expose rate limit headers (security through obscurity)

### 3. Progressive Delays
- Adds increasing delays between failed attempts
- Delays: 0s → 1s → 5s → 15s → 30s → 60s
- Makes brute force attacks impractical
- Resets on successful authentication

### 4. CAPTCHA Protection
- Required after 3 failed attempts from same IP
- Simple math problems (addition, subtraction, multiplication)
- 5-minute validity for challenges
- Tokens generated on successful completion

### 5. Account Lockout
- Accounts locked after 10 failed attempts
- 24-hour lockout period
- Email notification sent with unlock link
- Admin override available

## API Endpoints

### Authentication Endpoints

#### POST `/api/users/apple-auth`
Protected by all rate limiting strategies:
- IP-based limiting
- Email-based limiting (if email provided)
- Progressive delays
- CAPTCHA requirement
- Account lockout checks

### CAPTCHA Endpoints

#### GET `/api/auth/captcha`
Get a new CAPTCHA challenge:
```json
{
  "success": true,
  "data": {
    "challengeId": "abc123...",
    "question": "What is 7 + 3?",
    "type": "math"
  }
}
```

#### POST `/api/auth/captcha/verify`
Verify CAPTCHA response:
```json
{
  "challengeId": "abc123...",
  "response": "10"
}
```

Response includes `captchaToken` for use in auth requests.

### Account Unlock Endpoints

#### POST `/api/auth/unlock-request`
Request account unlock email:
```json
{
  "email": "user@example.com"
}
```

Always returns success (prevents user enumeration).

#### POST `/api/auth/unlock-verify`
Verify unlock token:
```json
{
  "token": "unlock_token_from_email"
}
```

### Admin Endpoints

#### GET `/api/auth/rate-limit-stats` (Development only)
Returns current rate limiting statistics:
- Failed attempts by IP/email
- Currently blocked IPs
- Locked accounts
- CAPTCHA statistics

## Error Responses

### Rate Limit Exceeded (429)
```json
{
  "error": "Too Many Requests",
  "message": "Too many authentication attempts. Please try again later.",
  "retryAfter": 900
}
```

### CAPTCHA Required (403)
```json
{
  "error": "CAPTCHA Required",
  "message": "Too many failed attempts. Please complete the CAPTCHA.",
  "captchaRequired": true
}
```

### Account Locked (403)
```json
{
  "success": false,
  "error": "Account is locked due to security reasons. Please check your email for unlock instructions.",
  "code": "ACCOUNT_LOCKED"
}
```

## Monitoring & Alerts

### Key Metrics to Monitor
1. **Failed Login Rate**: Spikes indicate potential attacks
2. **Blocked IP Count**: High numbers may indicate distributed attacks
3. **CAPTCHA Solve Rate**: Low rates may indicate bot activity
4. **Account Lockouts**: Multiple lockouts may indicate targeted attacks

### Alert Thresholds
- Failed logins > 100/minute: Possible attack
- CAPTCHA solve rate < 50%: Bot activity suspected
- Account lockouts > 10/hour: Targeted attack possible
- Single IP > 50 attempts/hour: Aggressive attacker

## Troubleshooting

### User Locked Out Legitimately
1. Check account lock status in database
2. Verify unlock email was sent
3. Use admin unlock if needed
4. Review failed attempt logs

### Rate Limits Too Restrictive
1. Adjust limits in `rate-limits.ts`
2. Consider geographic differences
3. Monitor false positive rate
4. Implement allowlisting for trusted IPs

### Redis Connection Issues
- System falls back to in-memory limiting for IP-based limits
- Email-based and account lockout features require Redis
- Check Redis connection and credentials
- Monitor Redis memory usage

### CAPTCHA Issues
1. Verify Redis is running (stores challenges)
2. Check TTL settings
3. Monitor solve rates
4. Consider alternative CAPTCHA types

## Security Considerations

1. **No User Enumeration**: Generic error messages prevent discovering valid emails
2. **Distributed Attacks**: IP + email limits prevent circumvention
3. **Token Security**: Unlock tokens are single-use with 24h expiry
4. **Admin Access**: Protect admin endpoints in production
5. **Rate Limit Bypass**: No bypass for authentication endpoints

## Feature Flags

Enable/disable rate limiting with environment variable:
```bash
RATE_LIMITING_ENABLED=false  # Disables all rate limiting
```

## Implementation Details

### Redis Keys
- `rl_ip:{ip}` - IP-based rate limits
- `rl_email:{email}` - Email-based rate limits
- `rl_progressive:{ip}` - Progressive delay tracking
- `rl_captcha:{ip}` - CAPTCHA attempt tracking
- `failed_login:ip:{ip}` - Failed login attempt logs
- `failed_login:email:{email}` - Email-specific attempt logs
- `captcha:{challengeId}` - CAPTCHA challenges
- `account_locked:{email}` - Account lockout data

### Performance Impact
- Redis operations: ~1-2ms per check
- Progressive delays: Intentional, up to 60s
- Memory usage: ~100 bytes per tracked entity
- CPU impact: Negligible

## Best Practices

1. **Regular Reviews**: Review rate limit effectiveness monthly
2. **Gradual Adjustments**: Change limits incrementally
3. **User Communication**: Clear error messages and recovery paths
4. **Monitoring**: Set up alerts for anomalies
5. **Documentation**: Keep this document updated with changes