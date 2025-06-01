# Handoff Document: GitHub Actions & Deployment Setup

## 📋 What Was Set Up

### 1. **GitHub Actions Workflows**
- **`.github/workflows/ci.yml`** - Runs on all PRs, tests both backend and frontend
- **`.github/workflows/deploy-production.yml`** - Auto-deploys to production on push to main

### 2. **Deployment Scripts**
- **`scripts/dev-start.sh`** - Local development environment startup
- **`scripts/setup-digital-ocean.sh`** - Server setup automation script
- **`check/ecosystem.config.js`** - PM2 configuration for production

### 3. **Documentation Created**
- **`DEVELOPMENT_WORKFLOW.md`** - Complete development and deployment guide
- **`DIGITAL_OCEAN_SETUP_QUESTIONNAIRE.md`** - Server setup requirements checklist
- **`GITHUB_ACTIONS_VERIFICATION_GUIDE.md`** - Step-by-step verification instructions

## 🔍 What Needs Verification

### 1. **Server Configuration**
The user has a Digital Ocean server at `165.232.180.34` with user `sammy`. You need to verify:
- [ ] Bun is installed (v1.2.9+)
- [ ] PM2 is installed and configured
- [ ] Redis is running
- [ ] Nginx is configured
- [ ] Directory structure exists (`~/check`, `~/backups`)
- [ ] Environment variables are set in `~/check/.env`

### 2. **GitHub Repository Setup**
- [ ] Verify workflow files exist in `.github/workflows/`
- [ ] Check GitHub Secrets are configured (see list below)
- [ ] Confirm branch protection on `main`

### 3. **Required GitHub Secrets**
Go to Settings → Secrets → Actions and verify:
- `DEPLOY_HOST` = `v.bkk.lol` (or the actual domain)
- `DEPLOY_USER` = `sammy`
- `DEPLOY_KEY` = (contents of server's `~/.ssh/deploy_key`)
- `DEPLOY_PATH` = `/home/sammy`
- `OPENAI_API_KEY` = (the actual API key)

## 🚀 Quick Verification Steps

1. **Test CI Pipeline**:
   ```bash
   # Create a test PR
   git checkout -b test/verify-ci
   echo "test" >> README.md
   git add . && git commit -m "test: verify CI"
   git push origin test/verify-ci
   # Open PR and watch CI checks
   ```

2. **Test Deployment**:
   ```bash
   # Option 1: Manual trigger
   # Go to Actions → Deploy to Production → Run workflow
   
   # Option 2: Push to main
   git checkout main
   git pull
   echo "<!-- Deploy test -->" >> README.md
   git add . && git commit -m "test: deployment"
   git push origin main
   ```

3. **Verify on Server**:
   ```bash
   ssh sammy@165.232.180.34
   pm2 list
   curl http://localhost:3001/health
   ```

## ⚠️ Important Notes

1. **Current Issues Resolved**:
   - OpenAI quota errors now handled gracefully
   - File deletion race condition fixed
   - JWT expiration handled properly

2. **Server Port**: 
   - The app runs on port 3001 (not 3000)
   - This is already configured in PM2 ecosystem

3. **Domain**: 
   - Currently using `v.bkk.lol`
   - SSL should be configured via Certbot

## 📚 Use These Guides

1. Start with `GITHUB_ACTIONS_VERIFICATION_GUIDE.md` for complete verification steps
2. If setting up a new server, use `scripts/setup-digital-ocean.sh`
3. For development workflow, refer to `DEVELOPMENT_WORKFLOW.md`

## 🆘 If Something Goes Wrong

1. **Deployment fails**: Check GitHub Actions logs first
2. **Server issues**: SSH in and check `pm2 logs`
3. **Can't connect**: Verify Nginx and firewall settings
4. **Database issues**: Check if SQLite files exist and have proper permissions

---

**Next Steps**: Follow the verification guide to ensure everything is working correctly. The deployment pipeline should trigger automatically when pushing to main branch. 