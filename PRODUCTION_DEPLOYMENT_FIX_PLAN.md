# Production Deployment Fix Plan

## 📅 Date: 2025-06-06
## 🎯 Goal: Fix production deployment issues and get API running

## 📋 Current Issues Summary

### ✅ Completed:
1. **Switched from v42 branch to main** - The server was on the wrong branch
2. **Installed dependencies** - Backend dependencies are now installed  
3. **Health check is working** - Confirmed with a test server that returns 200 OK

### ❌ Current Issues:
1. **Import/Export Mismatches** - The code has multiple import errors:
   - Missing `database` export from `/database/index.ts`
   - Missing `sessions` table from schema
   - Missing `CacheOptions` export from cache-service
   
2. **CI/CD Pipeline Failures**:
   - Backend tests have been running for 5+ hours (stuck)
   - Deployments failing at health check stage
   - Missing GitHub secrets (OPENAI_API_KEY)

### 🚨 Root Cause:
The deployment appears to have code from multiple feature branches mixed together, causing import/export mismatches. The application cannot start due to these syntax errors.

## 📋 Fix Production Deployment Todo Plan

### 🔴 High Priority - Fix Code Issues (Do First)
1. **Add missing 'database' export to /src/database/index.ts**
   - Already added but verify it's correct
   - Command: `echo 'export const database = dbInstance;' >> src/database/index.ts`
   
2. **Add missing 'sessions' table export to /src/database/schema.ts**
   - Already added but needs proper schema definition
   - Verify the schema matches what the code expects
   
3. **Fix CacheOptions export in /src/services/cache/cache-service.ts**
   - Check what's importing CacheOptions and fix the export
   - May need to add: `export interface CacheOptions { ... }`
   
4. **Test API startup locally after fixing imports**
   - Run `bun src/index.ts` to verify no more import errors
   - Check logs for successful startup message
   
5. **Configure GitHub Secrets**
   - Go to: https://github.com/adimov-eth/vibecheck/settings/secrets/actions
   - Add these secrets:
     ```
     OPENAI_API_KEY = [Get from OpenAI dashboard]
     DEPLOY_HOST = v.bkk.lol
     DEPLOY_USER = sammy
     DEPLOY_PATH = /home/sammy
     DEPLOY_KEY = [SSH private key content]
     ```

### 🟡 Medium Priority - Fix Deployment Config
6. **Update deployment script to use correct directory**
   - Ensure deploy script targets `/home/sammy/vibecheck/check`
   - Update `check/scripts/deploy-production.sh`
   
7. **Fix PM2 ecosystem config to use correct working directory**
   - Update `cwd` in ecosystem.config.cjs
   - Or use `PM2_CWD=/home/sammy/vibecheck/check` env variable
   
12. **Save PM2 configuration and enable startup script**
    ```bash
    pm2 save
    pm2 startup
    # Follow the instructions it provides
    ```

### 🟢 Low Priority - Cleanup Tasks
8. **Kill stuck GitHub Actions test jobs**
   - Cancel running workflows in GitHub UI
   - Or use: `gh run cancel [run-id]`
   
9. **Add typecheck and build scripts to check/package.json**
   ```json
   "scripts": {
     "typecheck": "tsc --noEmit",
     "build": "echo 'No build required for Bun runtime'"
   }
   ```

### ✅ Final Verification
10. **Restart all vibecheck services with PM2 after fixes**
    ```bash
    cd /home/sammy/vibecheck/check
    pm2 delete all
    PM2_CWD=/home/sammy/vibecheck/check pm2 start ecosystem.config.cjs
    ```
    
11. **Verify health check returns 200 OK on production**
    ```bash
    curl -I https://v.bkk.lol/health
    # Should return HTTP/2 200
    ```

## 🔧 Useful Commands

**SSH to server:**
```bash
ssh sammy@165.232.180.34
```

**Check PM2 status:**
```bash
pm2 list
pm2 logs vibecheck-api --lines 50
```

**Test API locally:**
```bash
cd /home/sammy/vibecheck/check
bun src/index.ts
```

**Check GitHub Actions:**
```bash
gh run list --limit 5
./scripts/monitor-github-actions.sh
```

## 📝 Important Notes

1. **Server Details:**
   - IP: 165.232.180.34
   - Domain: v.bkk.lol
   - User: sammy
   - Password: 42Iknow42
   - Uses zsh shell (source ~/.zshrc)

2. **Directory Structure:**
   - Main repo: `/home/sammy/vibecheck/`
   - Backend code: `/home/sammy/vibecheck/check/`
   - Frontend code: `/home/sammy/vibecheck/vibe/`

3. **Port Configuration:**
   - API runs on port 3001
   - Nginx proxies from HTTPS to localhost:3001

4. **Known Issues:**
   - PM2 logs show "fatal: not a git repository" warnings (can ignore)
   - Multiple code versions mixed together from different branches

This plan addresses all the issues found, prioritized by what's blocking the deployment.