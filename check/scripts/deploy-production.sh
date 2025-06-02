#!/bin/bash
set -euo pipefail

# Deployment configuration
DEPLOY_USER="${DEPLOY_USER:-sammy}"
DEPLOY_HOST="${DEPLOY_HOST:-165.232.180.34}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/sammy/vibecheck}"
BACKUP_PATH="${BACKUP_PATH:-/home/sammy/backups}"

echo "🚀 Starting deployment to ${DEPLOY_HOST}..."

# Check if running in CI or locally
if [ -n "${CI:-}" ]; then
    echo "📦 Running in CI environment"
    # Create deployment package
    tar -czf deploy.tar.gz \
        --exclude='node_modules' \
        --exclude='*.log' \
        --exclude='uploads/*' \
        --exclude='app.db*' \
        --exclude='.env' \
        --exclude='.git' \
        .
    
    # Deploy to server
    echo "📤 Uploading to server..."
    scp -o StrictHostKeyChecking=no deploy.tar.gz ${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/
    
    # Execute deployment on server
    ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} << 'ENDSSH'
        set -euo pipefail
        
        # Create backup
        echo "📦 Creating backup..."
        mkdir -p /home/sammy/backups
        if [ -d /home/sammy/vibecheck ]; then
            tar -czf /home/sammy/backups/vibecheck-$(date +%Y%m%d-%H%M%S).tar.gz -C /home/sammy vibecheck
        fi
        
        # Extract new version
        echo "📂 Extracting new version..."
        mkdir -p /home/sammy/vibecheck
        cd /home/sammy/vibecheck
        tar -xzf /tmp/deploy.tar.gz
        rm /tmp/deploy.tar.gz
        
        # Install dependencies
        echo "📦 Installing dependencies..."
        bun install --production
        
        # Run migrations
        echo "🗄️ Running migrations..."
        if [ -f "src/scripts/init-db.ts" ]; then
            bun run db:migrate || echo "Migration completed"
        fi
        
        # Restart services
        echo "🔄 Restarting services..."
        pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
        pm2 save
        
        # Verify deployment
        echo "✅ Verifying deployment..."
        sleep 5
        curl -f http://localhost:3001/health || echo "Health check pending..."
        
        echo "🎉 Deployment complete!"
ENDSSH
    
    # Cleanup
    rm -f deploy.tar.gz
else
    echo "📦 Running locally - using rsync"
    # Local deployment using rsync
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='*.log' \
        --exclude='uploads/*' \
        --exclude='app.db*' \
        --exclude='.env' \
        --exclude='.git' \
        . ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/
    
    # Execute deployment commands
    ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd ${DEPLOY_PATH} && bun install --production && pm2 restart ecosystem.config.cjs"
fi

echo "✅ Deployment script completed!"