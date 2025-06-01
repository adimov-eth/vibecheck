# GitHub Actions & Deployment Flow Verification Guide

## 🎯 Overview
This guide provides step-by-step instructions to verify the GitHub Actions CI/CD pipeline and deployment flow for the VibeCheck project.

## 📋 Pre-Verification Checklist

### 1. Repository Setup
- [ ] Verify `.github/workflows/` directory exists
- [ ] Check workflow files are present:
  - `ci.yml` - Continuous Integration
  - `deploy-production.yml` - Production deployment
- [ ] Confirm branch protection rules on `main` branch

### 2. GitHub Secrets Configuration
Verify these secrets are set in Settings → Secrets → Actions:
- [ ] `DEPLOY_HOST` - Server domain/IP (e.g., `v.bkk.lol`)
- [ ] `DEPLOY_USER` - SSH username (e.g., `sammy`)
- [ ] `DEPLOY_KEY` - Private SSH key content
- [ ] `DEPLOY_PATH` - Deployment path (e.g., `/home/sammy`)
- [ ] `OPENAI_API_KEY` - OpenAI API key

## 🧪 Testing CI Pipeline

### Step 1: Create a Test PR
```bash
# Create a test branch
git checkout -b test/ci-verification
git push origin test/ci-verification

# Make a small change (e.g., add comment to README)
echo "<!-- CI Test -->" >> README.md
git add README.md
git commit -m "test: verify CI pipeline"
git push origin test/ci-verification
```

### Step 2: Verify CI Checks
1. Open PR from `test/ci-verification` to `main`
2. Verify these checks run:
   - ✅ Backend CI
   - ✅ Frontend CI  
   - ✅ Security Scan
   - ✅ CI Status Check

### Step 3: Check CI Logs
For each job, verify:
- Dependencies install correctly
- Linting passes
- TypeScript compilation succeeds
- Tests run (or skip gracefully if none)
- OpenAI quota check runs

## 🚀 Testing Deployment Pipeline

### Step 1: Server Pre-Deployment Verification

SSH into the server and run:
```bash
ssh sammy@165.232.180.34

# Verify prerequisites
echo "=== Checking Prerequisites ==="
bun --version          # Should be 1.2.9+
pm2 --version          # Should be installed
redis-cli ping         # Should return PONG
nginx -v               # Should be installed

# Check directory structure
echo "=== Checking Directories ==="
ls -la ~/              # Should have check/, backups/
ls -la ~/check/        # Should have logs/, uploads/

# Check PM2 status
echo "=== Current PM2 Status ==="
pm2 list

# Check environment
echo "=== Environment Check ==="
[ -f ~/check/.env ] && echo "✅ .env exists" || echo "❌ .env missing"
[ -f ~/check/ecosystem.config.js ] && echo "✅ ecosystem.config.js exists" || echo "❌ ecosystem.config.js missing"
```

### Step 2: Manual Deployment Test

**Option A: Trigger via GitHub UI**
1. Go to Actions tab
2. Select "Deploy to Production"
3. Click "Run workflow"
4. Select `main` branch
5. Click "Run workflow" button

**Option B: Trigger via Push**
```bash
# Merge test PR or push to main
git checkout main
git pull origin main
echo "<!-- Deployment test $(date) -->" >> README.md
git add README.md
git commit -m "chore: trigger deployment test"
git push origin main
```

### Step 3: Monitor Deployment

**In GitHub Actions:**
- Watch the workflow progress
- Check each step completes:
  - ✅ Run Tests
  - ✅ Setup SSH Key
  - ✅ Deploy to Server
  - ✅ Verify Deployment
  - ✅ Create Deployment Record

**On the server (in another terminal):**
```bash
# Watch PM2 logs during deployment
pm2 logs --lines 100

# In another window, monitor processes
watch -n 1 'pm2 list'
```

### Step 4: Post-Deployment Verification

```bash
# On server
echo "=== Post-Deployment Checks ==="

# Check PM2 processes
pm2 list
pm2 info vibecheck-api
pm2 info vibecheck-workers

# Check health endpoint
curl -I http://localhost:3001/health

# Check logs for errors
pm2 logs --lines 50 --err

# Verify backup was created
ls -la ~/backups/

# Check disk space
df -h

# Check memory
free -m
```

**From local machine:**
```bash
# Test public health endpoint
curl -I https://v.bkk.lol/health

# Test WebSocket connection
wscat -c wss://v.bkk.lol/ws
```

## 🔄 Testing Rollback

### Step 1: Simulate Failed Deployment
```bash
# Create a breaking change
git checkout -b test/rollback
# Add intentional error to check/src/index.ts
git add .
git commit -m "test: intentional breaking change"
git push origin test/rollback
# Create and merge PR
```

### Step 2: Trigger Rollback
1. Go to Actions → Deploy to Production
2. Run workflow manually
3. Monitor rollback process

### Step 3: Verify Rollback
```bash
# On server
pm2 list           # Should show running processes
pm2 logs --lines 20
curl http://localhost:3001/health
```

## 📊 Verification Report Template

```markdown
## GitHub Actions Deployment Verification Report

**Date**: [DATE]
**Verified By**: [NAME]

### CI Pipeline
- [ ] PR triggers CI correctly
- [ ] All CI checks pass
- [ ] Security scans run
- [ ] Build artifacts created

### Deployment Pipeline
- [ ] Manual trigger works
- [ ] Push to main triggers deployment
- [ ] SSH authentication successful
- [ ] File sync completes
- [ ] PM2 reload successful
- [ ] Health checks pass
- [ ] Deployment record created

### Server State
- [ ] All processes running
- [ ] No error logs
- [ ] Endpoints accessible
- [ ] Database intact
- [ ] Backups created

### Rollback Testing
- [ ] Rollback triggers correctly
- [ ] Previous version restored
- [ ] Services recover

### Issues Found
1. [Issue description]
2. [Issue description]

### Recommendations
1. [Recommendation]
2. [Recommendation]
```

## 🚨 Common Issues & Solutions

### 1. SSH Key Authentication Fails
```bash
# Verify deploy key on server
cat ~/.ssh/deploy_key.pub

# Check GitHub deploy keys
# Settings → Deploy keys → Verify key matches

# Test SSH connection
ssh -i ~/.ssh/deploy_key -T git@github.com
```

### 2. PM2 Not Found During Deployment
```bash
# On server, reinstall PM2 globally
sudo npm install -g pm2
pm2 startup
pm2 save
```

### 3. Health Check Fails
```bash
# Check if process is running
pm2 list
pm2 logs vibecheck-api --lines 100

# Check port binding
sudo netstat -tlnp | grep 3001

# Check Nginx
sudo nginx -t
sudo systemctl status nginx
```

### 4. File Permissions Issues
```bash
# Fix ownership
sudo chown -R sammy:sammy ~/check
chmod -R 755 ~/check
chmod 600 ~/check/.env
```

## 📝 Final Verification Steps

1. **Create Deployment Runbook**
   - Document exact deployment steps
   - Include rollback procedures
   - List emergency contacts

2. **Schedule Regular Tests**
   - Weekly deployment to staging
   - Monthly rollback drill
   - Quarterly disaster recovery test

3. **Monitor Metrics**
   - Deployment frequency
   - Deployment success rate
   - Mean time to recovery (MTTR)
   - Deployment duration

## 🔗 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Digital Ocean Droplet Best Practices](https://docs.digitalocean.com/products/droplets/resources/)

---

**Note**: This verification should be performed after any significant changes to the deployment pipeline or server configuration. 