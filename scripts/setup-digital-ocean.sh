#!/bin/bash

# VibeCheck Digital Ocean Server Setup Script
# Run this on your Digital Ocean droplet to prepare for GitHub Actions deployment

set -e

echo "🚀 VibeCheck Server Setup Script"
echo "================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get user input
read -p "Enter your domain name (e.g., api.vibecheck.com): " DOMAIN
read -p "Enter deployment user (default: sammy): " DEPLOY_USER
DEPLOY_USER=${DEPLOY_USER:-sammy}
read -p "Enter your email for SSL cert: " EMAIL

echo -e "\n${YELLOW}Setting up server with:${NC}"
echo "Domain: $DOMAIN"
echo "User: $DEPLOY_USER"
echo "Email: $EMAIL"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Update system
echo -e "\n${GREEN}1. Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y

# Install essential packages
echo -e "\n${GREEN}2. Installing essential packages...${NC}"
sudo apt install -y curl git build-essential nginx redis-server ufw fail2ban

# Install Bun
echo -e "\n${GREEN}3. Installing Bun...${NC}"
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Node.js (for PM2)
echo -e "\n${GREEN}4. Installing Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
echo -e "\n${GREEN}5. Installing PM2...${NC}"
sudo npm install -g pm2
pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER

# Create deployment user (if not exists)
if [ "$DEPLOY_USER" != "$(whoami)" ]; then
    echo -e "\n${GREEN}6. Creating deployment user...${NC}"
    sudo adduser --disabled-password --gecos "" $DEPLOY_USER || echo "User already exists"
    sudo usermod -aG sudo $DEPLOY_USER
fi

# Setup directory structure
echo -e "\n${GREEN}7. Setting up directory structure...${NC}"
sudo -u $DEPLOY_USER mkdir -p /home/$DEPLOY_USER/{check,backups}
sudo -u $DEPLOY_USER mkdir -p /home/$DEPLOY_USER/check/{logs,uploads}

# Configure firewall
echo -e "\n${GREEN}8. Configuring firewall...${NC}"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3001 # API port
sudo ufw --force enable

# Configure Nginx
echo -e "\n${GREEN}9. Configuring Nginx...${NC}"
sudo tee /etc/nginx/sites-available/vibecheck > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
    
    # File upload size
    client_max_body_size 10M;
}
EOF

sudo ln -sf /etc/nginx/sites-available/vibecheck /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Install SSL certificate
echo -e "\n${GREEN}10. Installing SSL certificate...${NC}"
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

# Configure Redis
echo -e "\n${GREEN}11. Configuring Redis...${NC}"
sudo sed -i 's/supervised no/supervised systemd/g' /etc/redis/redis.conf
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Setup SSH key for deployment
echo -e "\n${GREEN}12. Setting up SSH deployment key...${NC}"
sudo -u $DEPLOY_USER ssh-keygen -t ed25519 -f /home/$DEPLOY_USER/.ssh/deploy_key -N ""
echo -e "\n${YELLOW}Add this public key to your GitHub repository deploy keys:${NC}"
sudo -u $DEPLOY_USER cat /home/$DEPLOY_USER/.ssh/deploy_key.pub

# Create PM2 ecosystem file
echo -e "\n${GREEN}13. Creating PM2 ecosystem file...${NC}"
sudo -u $DEPLOY_USER tee /home/$DEPLOY_USER/check/ecosystem.config.js > /dev/null << 'EOF'
module.exports = {
  apps: [
    {
      name: 'vibecheck-api',
      script: 'bun',
      args: 'src/index.ts',
      cwd: '/home/$DEPLOY_USER/check',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      time: true,
      max_memory_restart: '1G'
    },
    {
      name: 'vibecheck-workers',
      script: 'bun',
      args: 'src/workers/index.ts',
      cwd: '/home/$DEPLOY_USER/check',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      time: true,
      max_memory_restart: '1G'
    }
  ]
};
EOF

# Setup log rotation
echo -e "\n${GREEN}14. Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/vibecheck > /dev/null << EOF
/home/$DEPLOY_USER/check/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $DEPLOY_USER $DEPLOY_USER
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Create .env template
echo -e "\n${GREEN}15. Creating .env template...${NC}"
sudo -u $DEPLOY_USER tee /home/$DEPLOY_USER/check/.env.example > /dev/null << 'EOF'
NODE_ENV=production
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=file:./app.db
OPENAI_API_KEY=
JWT_SECRET=
APPLE_SHARED_SECRET=
EOF

# Final instructions
echo -e "\n${GREEN}✅ Server setup complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Copy the SSH public key above and add it to your GitHub repo as a deploy key"
echo "2. Configure GitHub Secrets:"
echo "   - DEPLOY_HOST=$DOMAIN"
echo "   - DEPLOY_USER=$DEPLOY_USER" 
echo "   - DEPLOY_KEY=(contents of /home/$DEPLOY_USER/.ssh/deploy_key)"
echo "   - DEPLOY_PATH=/home/$DEPLOY_USER"
echo "3. Copy your .env file to /home/$DEPLOY_USER/check/.env"
echo "4. Push to main branch to trigger deployment!"
echo ""
echo -e "${GREEN}Server is ready for GitHub Actions deployment!${NC}" 