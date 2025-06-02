# VibeCheck Production Deployment Guide

## Prerequisites on Production Server

1. **System Requirements**
   - Ubuntu 20.04+ or similar Linux distribution
   - Bun v1.2.9+ installed
   - PM2 installed globally: `bun install -g pm2`
   - Redis server running
   - Git installed
   - Sufficient disk space for logs and uploads

2. **Required Environment Variables** (in `.env` file)
   ```env
   PORT=3001
   OPENAI_API_KEY=sk-proj-...
   REDIS_HOST=localhost
   REDIS_PORT=6379
   APPLE_SHARED_SECRET=your_secret
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=7d
   ```

## Deployment Steps

### 1. Initial Setup (First Time Only)

```bash
# Clone repository
cd /home/sammy
git clone git@github.com:your-username/vibecheck.git
cd vibecheck/check

# Copy environment file
cp .env.example .env
# Edit .env with your production values
nano .env

# Create necessary directories
mkdir -p logs uploads

# Install dependencies
bun install --production

# Initialize database
bun run src/database/migrate.ts
```

### 2. Regular Deployment

```bash
# Navigate to project
cd /home/sammy/vibecheck/check

# Pull latest changes
git pull origin main

# Run deployment script
./scripts/deploy-production.sh
```

### 3. Manual Deployment (if script fails)

```bash
# Stop existing processes
pm2 delete all

# Install/update dependencies
bun install --production

# Run migrations
bun run src/database/migrate.ts

# Start PM2 processes
pm2 start ecosystem.config.cjs

# Save PM2 configuration
pm2 save

# Setup auto-start on reboot
pm2 startup
```

### 4. Verify Deployment

```bash
# Run verification script
./scripts/verify-deployment.sh

# Or manually check:
pm2 status
pm2 logs --lines 50
curl http://localhost:3001/health
```

## Monitoring

### View Logs
```bash
# All logs
pm2 logs

# Specific service
pm2 logs vibecheck-api
pm2 logs vibecheck-audio-worker

# With line limit
pm2 logs --lines 100
```

### Check Process Status
```bash
# Basic status
pm2 status

# Detailed info
pm2 show vibecheck-api

# Monitor mode (real-time)
pm2 monit
```

### Check System Resources
```bash
# Memory usage
pm2 list
free -h

# Disk usage
df -h
du -sh logs/ uploads/
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 3001
   lsof -i :3001
   # Kill if necessary
   kill -9 <PID>
   ```

2. **Redis Connection Failed**
   ```bash
   # Check Redis status
   systemctl status redis
   # Start if needed
   sudo systemctl start redis
   ```

3. **Database Locked**
   ```bash
   # Check for SQLite lock files
   ls -la app.db*
   # Remove WAL files if corrupted
   rm app.db-shm app.db-wal
   ```

4. **Worker Crashes**
   ```bash
   # Check specific worker logs
   pm2 logs vibecheck-audio-worker --err
   # Restart specific worker
   pm2 restart vibecheck-audio-worker
   ```

### Emergency Commands

```bash
# Stop all processes
pm2 stop all

# Delete all processes
pm2 delete all

# Kill PM2 daemon
pm2 kill

# Clear all logs
pm2 flush

# Reset PM2
pm2 update
```

## Maintenance

### Regular Tasks

1. **Log Rotation** (weekly)
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 100M
   pm2 set pm2-logrotate:retain 7
   ```

2. **Database Backup** (daily)
   ```bash
   cp app.db backups/app.db.$(date +%Y%m%d)
   ```

3. **Clean Old Uploads** (monthly)
   ```bash
   find uploads/ -type f -mtime +30 -delete
   ```

## Security Checklist

- [ ] Environment variables are not committed to git
- [ ] Redis is bound to localhost only
- [ ] File upload directory has proper permissions
- [ ] PM2 web interface is disabled or secured
- [ ] Database file has restricted permissions
- [ ] API rate limiting is enabled
- [ ] HTTPS is configured (via reverse proxy)

## Performance Tuning

### PM2 Configuration
- Memory limits are set per process
- Auto-restart on memory threshold
- Cluster mode for API (if needed)
- Proper restart delays

### Database Optimization
```bash
# Run SQLite optimization
sqlite3 app.db "VACUUM;"
sqlite3 app.db "ANALYZE;"
```

### Redis Optimization
```bash
# Check Redis memory usage
redis-cli info memory
# Set max memory if needed
redis-cli config set maxmemory 2gb
redis-cli config set maxmemory-policy allkeys-lru
```

## Rollback Procedure

If deployment fails:

```bash
# Revert to previous commit
git reset --hard HEAD~1

# Or checkout specific version
git checkout <commit-hash>

# Reinstall dependencies
bun install --production

# Restart services
pm2 restart ecosystem.config.cjs
```

## Contact & Support

- **Logs Location**: `/home/sammy/vibecheck/check/logs/`
- **Database**: `/home/sammy/vibecheck/check/app.db`
- **Uploads**: `/home/sammy/vibecheck/check/uploads/`
- **PM2 Config**: `/home/sammy/vibecheck/check/ecosystem.config.cjs` 