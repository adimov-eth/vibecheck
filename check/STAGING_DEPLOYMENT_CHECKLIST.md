# Staging Deployment Checklist

## Pre-Deployment Verification

### 1. Feature Flags Status
- [ ] Verify `USE_DRIZZLE` environment variable is set to `true`
- [ ] Verify `RATE_LIMITING_ENABLED` environment variable is set to `true`
- [ ] Confirm feature flag values in `.env.staging`:
  ```env
  USE_DRIZZLE=true
  RATE_LIMITING_ENABLED=true
  ```

### 2. Database Migration Status
- [ ] Run Drizzle migrations on staging database:
  ```bash
  cd check
  bun run drizzle-kit push:sqlite
  ```
- [ ] Verify schema includes new fields:
  - `users.accountLocked`
  - `users.accountLockedAt`
  - `users.failedLoginAttempts`
  - `users.lastFailedLogin`

### 3. Redis Configuration
- [ ] Ensure Redis is running on staging server
- [ ] Test Redis connection:
  ```bash
  redis-cli ping
  ```
- [ ] Verify Redis memory settings for rate limiting

### 4. Dependencies
- [ ] Install new dependencies:
  ```bash
  cd check
  bun install --production
  ```
- [ ] Verify key packages:
  - `drizzle-orm`
  - `@libsql/client`
  - `rate-limiter-flexible`

## Deployment Steps

### 1. Backup Current State
```bash
# Backup database
cp app.db backups/app.db.$(date +%Y%m%d-%H%M%S)

# Backup current code
git stash
git tag staging-backup-$(date +%Y%m%d-%H%M%S)
```

### 2. Deploy Code
```bash
# Pull latest changes
git pull origin main

# Install dependencies
bun install --production

# Run database migrations
bun run src/database/migrations.ts
```

### 3. Environment Configuration
```bash
# Update .env with feature flags
echo "USE_DRIZZLE=true" >> .env
echo "RATE_LIMITING_ENABLED=true" >> .env

# Verify JWT rotation settings
echo "JWT_KEY_ROTATION_ENABLED=true" >> .env
```

### 4. Start Services
```bash
# Restart PM2 services
pm2 restart ecosystem.config.cjs

# Start JWT rotation scheduler (if not already running)
pm2 start src/scripts/jwt-key-rotation-scheduler.ts --name jwt-rotation
```

## Post-Deployment Testing

### 1. Health Checks
- [ ] API health endpoint: `curl http://staging.example.com/health`
- [ ] Database connectivity: Test user creation/retrieval
- [ ] Redis connectivity: Check rate limiting counters

### 2. Feature Testing

#### Drizzle ORM
- [ ] Create a test user via API
- [ ] Retrieve user details
- [ ] Update user profile
- [ ] Check SQL injection protection with malicious input

#### Rate Limiting
- [ ] Test IP-based rate limiting (5 attempts/15 min)
- [ ] Test email-based rate limiting (10 attempts/hour)
- [ ] Verify progressive delays are applied
- [ ] Test CAPTCHA trigger after 3 failed attempts
- [ ] Test account lockout after 10 failed attempts

#### JWT Key Rotation
- [ ] Verify new tokens include `kid` header
- [ ] Test token verification with rotated keys
- [ ] Check legacy token support
- [ ] Monitor key rotation logs

### 3. Performance Monitoring
- [ ] Response time for auth endpoints
- [ ] Database query performance
- [ ] Memory usage with new features
- [ ] Redis memory consumption

## Monitoring Setup

### 1. Logs to Monitor
```bash
# API logs
pm2 logs vibecheck-api --lines 100

# Worker logs
pm2 logs vibecheck-audio-worker --lines 100

# JWT rotation logs
pm2 logs jwt-rotation --lines 50
```

### 2. Key Metrics
- Auth success/failure rate
- Rate limit triggers per hour
- Database query times
- JWT key rotation events

### 3. Alerts to Configure
- [ ] High rate of auth failures (>50/hour)
- [ ] Database connection errors
- [ ] Redis connection errors
- [ ] JWT rotation failures

## Rollback Plan

### If Issues Arise:

1. **Disable Features via Environment**
   ```bash
   # Quick disable without code changes
   export USE_DRIZZLE=false
   export RATE_LIMITING_ENABLED=false
   pm2 restart all
   ```

2. **Database Rollback**
   ```bash
   # Restore database backup
   cp backups/app.db.TIMESTAMP app.db
   pm2 restart all
   ```

3. **Code Rollback**
   ```bash
   # Revert to previous version
   git checkout staging-backup-TIMESTAMP
   bun install --production
   pm2 restart all
   ```

## Success Criteria

### Performance
- [ ] API response time <200ms for auth endpoints
- [ ] No memory leaks after 1 hour of operation
- [ ] Redis memory usage <100MB

### Functionality
- [ ] All auth endpoints working correctly
- [ ] Rate limiting preventing brute force attacks
- [ ] JWT rotation happening automatically
- [ ] No SQL injection vulnerabilities

### Stability
- [ ] No process crashes in first hour
- [ ] Error rate <1% for auth operations
- [ ] All health checks passing

## Sign-off

- [ ] Dev team approval
- [ ] Security review completed
- [ ] Performance benchmarks met
- [ ] Rollback plan tested
- [ ] Monitoring configured

## Notes

- Keep feature flags disabled initially, enable one at a time
- Monitor closely for first 24 hours
- Have rollback commands ready in a separate terminal
- Document any issues or unexpected behavior

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Status**: _______________