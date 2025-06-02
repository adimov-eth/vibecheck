# VibeCheck Development Workflow Guide

## 🎯 Overview

This guide outlines the optimal development workflow for the VibeCheck project, focusing on efficient server deployment while maintaining the mobile app development cycle.

## 📁 Project Structure

```
final/
├── check/          # Backend API Server (Bun + Express)
├── vibe/           # Mobile App (React Native + Expo)
├── .github/        # GitHub Actions workflows
├── scripts/        # Deployment and utility scripts
└── docs/           # Documentation
```

## 🛠️ Local Development Setup

### 1. Prerequisites Installation

```bash
# Install required tools
curl -fsSL https://bun.sh/install | bash  # Bun for backend
npm install -g pnpm@latest                 # pnpm for frontend
brew install redis                         # Redis for queues
brew install watchman                      # For React Native

# Verify installations
bun --version    # Should be 1.2.9+
pnpm --version   # Should be 10.6.3+
redis-cli ping   # Should return PONG
```

### 2. Repository Setup

```bash
# Clone and setup
git clone <repository-url> vibecheck
cd vibecheck

# Setup git hooks for quality control
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
cd check && bun run lint
cd ../vibe && pnpm run lint
EOF
chmod +x .git/hooks/pre-commit
```

### 3. Environment Configuration

Create a `.env.local` file for local development:

```bash
# check/.env.local (for local dev)
NODE_ENV=development
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=file:./app.db
OPENAI_API_KEY=sk-...
JWT_SECRET=local_dev_secret_min_32_chars_long
APPLE_SHARED_SECRET=your_apple_secret

# vibe/.env.local
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_ENV=development
```

## 🔄 Development Workflow

### 1. Branch Strategy

```bash
# Main branches
main        # Production-ready code
develop     # Integration branch
staging     # Pre-production testing

# Feature branches
feature/description
bugfix/description
hotfix/description

# Create feature branch
git checkout -b feature/audio-optimization
```

### 2. Running Development Servers

Use tmux or multiple terminal tabs:

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Backend API
cd check
bun run dev

# Terminal 3: Background Workers
cd check
bun run dev:workers

# Terminal 4: Mobile App
cd vibe
pnpm start

# Terminal 5: OpenAI Status Monitor (optional)
watch -n 300 'cd check && bun run check:openai'
```

### 3. Development Scripts

Create helpful development scripts:

```bash
# scripts/dev-start.sh
#!/bin/bash
echo "🚀 Starting VibeCheck Development Environment..."

# Start Redis in background
redis-server --daemonize yes

# Start backend
cd check
bun run dev &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start workers
bun run workers &
WORKERS_PID=$!

# Start frontend
cd ../vibe
pnpm start &
FRONTEND_PID=$!

echo "✅ Development environment started!"
echo "Backend PID: $BACKEND_PID"
echo "Workers PID: $WORKERS_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for any process to exit
wait
```

## 🚀 Deployment Pipeline

### 1. Pre-deployment Checklist

```bash
# scripts/pre-deploy-check.sh
#!/bin/bash

echo "🔍 Running pre-deployment checks..."

# Check OpenAI API
cd check && bun run check:openai || exit 1

# Run tests
bun test || exit 1

# Check for TypeScript errors
bun run typecheck || exit 1

# Lint check
bun run lint || exit 1

# Database migration dry-run
bun run db:migrate --dry-run || exit 1

echo "✅ All checks passed!"
```

### 2. Staging Deployment

```bash
# scripts/deploy-staging.sh
#!/bin/bash
set -e

SERVER="sammy@staging.vibecheck.com"
DEPLOY_DIR="/home/sammy/vibecheck"

echo "🚀 Deploying to staging..."

# Build and prepare
cd check
bun install --production
bun run build

# Copy files to staging
rsync -avz --exclude 'node_modules' --exclude '.env' --exclude 'uploads' \
  ./ $SERVER:$DEPLOY_DIR/check/

# Run deployment on server
ssh $SERVER << 'ENDSSH'
cd /home/sammy/vibecheck/check
bun install --production
bun run db:migrate
pm2 restart vibecheck-api
pm2 restart vibecheck-workers
ENDSSH

echo "✅ Staging deployment complete!"
```

### 3. Production Deployment

```bash
# scripts/deploy-production.sh
#!/bin/bash
set -e

# Require explicit confirmation
echo "⚠️  Production Deployment - Type 'DEPLOY' to confirm:"
read confirmation
[[ "$confirmation" == "DEPLOY" ]] || exit 1

# Run pre-deployment checks
./scripts/pre-deploy-check.sh || exit 1

# Create deployment tag
VERSION=$(date +%Y%m%d-%H%M%S)
git tag -a "deploy-$VERSION" -m "Production deployment $VERSION"
git push origin "deploy-$VERSION"

# Deploy to production
SERVER="sammy@prod.vibecheck.com"
DEPLOY_DIR="/home/sammy/vibecheck"

# ... (similar to staging but with production server)
```

## 📊 Monitoring & Rollback

### 1. Health Monitoring

```bash
# scripts/monitor-health.sh
#!/bin/bash

ENDPOINTS=(
  "https://api.vibecheck.com/health"
  "https://api.vibecheck.com/subscriptions/health"
)

for endpoint in "${ENDPOINTS[@]}"; do
  response=$(curl -s -o /dev/null -w "%{http_code}" $endpoint)
  if [[ $response -eq 200 ]]; then
    echo "✅ $endpoint - OK"
  else
    echo "❌ $endpoint - Failed (HTTP $response)"
    # Send alert
  fi
done
```

### 2. Quick Rollback

```bash
# scripts/rollback.sh
#!/bin/bash

PREVIOUS_TAG=$(git describe --abbrev=0 --tags HEAD^)
echo "🔄 Rolling back to $PREVIOUS_TAG..."

git checkout $PREVIOUS_TAG
./scripts/deploy-production.sh
```

## 🔧 PM2 Configuration

Create PM2 ecosystem file:

```javascript
// check/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'vibecheck-api',
      script: 'bun',
      args: 'src/index.ts',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      time: true
    },
    {
      name: 'vibecheck-workers',
      script: 'bun',
      args: 'src/workers/index.ts',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      time: true
    }
  ]
};
```

## 🔒 Security Best Practices

### 1. Environment Variables

```bash
# Use dotenv-vault for secure env management
npx dotenv-vault@latest new
npx dotenv-vault@latest push production

# Or use encrypted env files
openssl enc -aes-256-cbc -salt -in .env -out .env.enc
```

### 2. Secrets Rotation

```bash
# Rotate JWT secret quarterly
NEW_JWT_SECRET=$(openssl rand -base64 32)
echo "New JWT Secret: $NEW_JWT_SECRET"
# Update in production carefully with grace period
```

## 📈 Performance Optimization

### 1. Build Optimization

```bash
# check/scripts/optimize-build.sh
#!/bin/bash

# Minify and bundle
bun build src/index.ts --outdir=dist --minify

# Remove dev dependencies
bun install --production

# Clean unnecessary files
find . -name "*.test.ts" -delete
find . -name "*.spec.ts" -delete
```

### 2. Database Optimization

```sql
-- Regular maintenance
PRAGMA optimize;
VACUUM;
ANALYZE;

-- For PostgreSQL in production
VACUUM ANALYZE;
REINDEX DATABASE vibecheck;
```

## 🎯 Quick Commands Reference

```bash
# Development
make dev          # Start all development services
make stop         # Stop all services
make logs         # View all logs
make clean        # Clean build artifacts

# Testing
make test         # Run all tests
make test-api     # Test API only
make test-mobile  # Test mobile app

# Deployment
make deploy-staging     # Deploy to staging
make deploy-production  # Deploy to production
make rollback          # Rollback to previous version

# Monitoring
make health       # Check all services health
make metrics      # View performance metrics
make alerts       # Check alert status
```

## 📝 Makefile

Create a Makefile for common tasks:

```makefile
# Makefile
.PHONY: dev stop logs clean test deploy-staging deploy-production

dev:
	@./scripts/dev-start.sh

stop:
	@pkill -f "bun.*dev" || true
	@pkill -f "expo start" || true
	@redis-cli shutdown || true

logs:
	@tail -f check/logs/*.log

clean:
	@rm -rf check/dist check/node_modules vibe/node_modules
	@rm -f check/app.db-wal check/app.db-shm

test:
	@cd check && bun test
	@cd vibe && pnpm test

deploy-staging:
	@./scripts/deploy-staging.sh

deploy-production:
	@./scripts/deploy-production.sh

health:
	@./scripts/monitor-health.sh
```

## 🚨 Troubleshooting Deployment

### Common Issues

1. **Port Already in Use**
   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```

2. **Database Locked**
   ```bash
   rm check/app.db-wal check/app.db-shm
   pm2 restart vibecheck-api
   ```

3. **Redis Connection Failed**
   ```bash
   redis-cli ping
   sudo systemctl restart redis
   ```

4. **PM2 Process Not Starting**
   ```bash
   pm2 kill
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

## 📚 Additional Resources

- [Bun Deployment Guide](https://bun.sh/guides/runtime/deploy)
- [PM2 Production Guide](https://pm2.keymetrics.io/docs/usage/deployment/)
- [Expo EAS Build](https://docs.expo.dev/eas/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)

---

Remember: Always test in staging before production deployment!

## 🚀 GitHub Actions Automated Deployment

### Prerequisites for Digital Ocean Server

1. **Run Server Setup Script**:
   ```bash
   # SSH into your Digital Ocean droplet
   ssh root@your-server-ip
   
   # Download and run setup script
   curl -O https://raw.githubusercontent.com/your-repo/main/scripts/setup-digital-ocean.sh
   chmod +x setup-digital-ocean.sh
   ./setup-digital-ocean.sh
   ```

2. **Configure GitHub Secrets**:
   Go to your repository Settings → Secrets → Actions and add:
   
   | Secret Name | Description | Example |
   |------------|-------------|---------|
   | `DEPLOY_HOST` | Your server domain/IP | `api.vibecheck.com` |
   | `DEPLOY_USER` | SSH username | `sammy` |
   | `DEPLOY_KEY` | Private SSH key content | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
   | `DEPLOY_PATH` | Deployment directory | `/home/sammy` |
   | `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

3. **Add Deploy Key to GitHub**:
   - Go to Settings → Deploy keys
   - Add the public key from server setup
   - Enable "Allow write access" if using git operations

### Deployment Workflows

#### 1. Automatic Production Deployment
Triggers on push to `main` branch:
```yaml
# .github/workflows/deploy-production.yml
- Runs all CI tests
- Deploys to production server
- Creates backup before deployment
- Performs health checks
- Supports manual rollback
```

#### 2. Manual Deployment
Trigger deployment manually from GitHub Actions tab:
- Go to Actions → Deploy to Production
- Click "Run workflow"
- Select branch to deploy

#### 3. Rollback Procedure
If deployment fails:
```bash
# Option 1: GitHub Actions UI
- Go to Actions → Deploy to Production
- Click "Run workflow" → Select "rollback"

# Option 2: SSH to server
ssh sammy@your-server
cd /home/sammy
./scripts/rollback-latest.sh
```

### Monitoring Deployments

1. **GitHub Deployment Status**:
   - Check Environments tab in GitHub
   - View deployment history
   - See active/inactive deployments

2. **Server Health Checks**:
   ```bash
   # Check service status
   pm2 status
   
   # View logs
   pm2 logs vibecheck-api
   pm2 logs vibecheck-workers
   
   # Check health endpoint
   curl https://api.vibecheck.com/health
   ```

3. **Deployment Notifications**:
   Add to workflow for Slack/Discord notifications:
   ```yaml
   - name: Notify Slack
     if: always()
     uses: slackapi/slack-github-action@v1
     with:
       webhook-url: ${{ secrets.SLACK_WEBHOOK }}
       payload: |
         {
           "text": "Deployment ${{ job.status }}: ${{ github.sha }}"
         }
   ```

### Troubleshooting GitHub Actions

**Common Issues:**

1. **SSH Connection Failed**:
   - Verify deploy key is correctly added
   - Check server firewall allows GitHub IPs
   - Ensure SSH key format is correct

2. **PM2 Not Found**:
   - Run server setup script again
   - Manually install: `npm install -g pm2`

3. **Deployment Hangs**:
   - Check for interactive prompts
   - Add timeouts to deployment steps
   - Review server logs

4. **Health Check Fails**:
   - Verify Nginx configuration
   - Check PM2 process status
   - Review application logs 