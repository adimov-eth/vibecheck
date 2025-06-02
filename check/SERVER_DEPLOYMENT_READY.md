# VibeCheck Server Deployment - Quick Reference

## ✅ Current Status
- PM2 ecosystem config ready: `ecosystem.config.cjs`
- All 5 services configured (API + 4 workers)
- Environment variables loaded from `.env`
- Deployment scripts ready in `scripts/`

## 🚀 Quick Deploy on Production Server

```bash
# SSH to server
ssh sammy@v.bkk.lol

# Navigate to project
cd /home/sammy/vibecheck/check

# Stop old processes (from sys.json)
pm2 delete all

# Pull latest code
git pull origin main

# Deploy with script
./scripts/deploy-production.sh

# Or manually:
bun install --production
pm2 start ecosystem.config.cjs
pm2 save
```

## 📋 Key Differences from `sys.json`

| Feature | Old (sys.json) | New (ecosystem.config.cjs) |
|---------|----------------|----------------------------|
| Workers | 3 separate | 5 separate (added cleanup) |
| Logs | Combined | Separate per service |
| Memory limits | No | Yes (configured) |
| Env loading | Manual | Automatic from .env |
| Restart policy | Basic | Advanced with delays |

## 🔍 Verify Deployment

```bash
# Quick check
pm2 status
curl http://localhost:3001/health

# Full verification
./scripts/verify-deployment.sh

# View logs
pm2 logs --lines 100
```

## 📝 Important Files

- **Config**: `ecosystem.config.cjs`
- **Deploy script**: `scripts/deploy-production.sh`
- **Verify script**: `scripts/verify-deployment.sh`
- **Full guide**: `PRODUCTION_DEPLOYMENT.md`

## ⚠️ Don't Forget

1. Ensure `.env` file exists on server with all variables
2. Redis must be running
3. Create `logs/` and `uploads/` directories
4. Run database migrations if needed
5. Set up PM2 startup script for auto-restart

## 🆘 If Something Goes Wrong

```bash
# Check logs
pm2 logs vibecheck-api --err

# Restart everything
pm2 restart ecosystem.config.cjs

# Nuclear option
pm2 delete all && pm2 start ecosystem.config.cjs
``` 