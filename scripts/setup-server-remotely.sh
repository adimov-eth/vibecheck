#!/bin/bash

echo "🚀 VibeCheck Server Setup Script"
echo "================================"

# This script should be run ON THE SERVER as the sammy user

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${YELLOW}1. Checking Node.js and npm...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"
else
    echo -e "${RED}❌ Node.js not found - installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "\n${YELLOW}2. Checking Bun...${NC}"
if command -v bun &> /dev/null; then
    echo -e "${GREEN}✅ Bun installed: $(bun --version)${NC}"
else
    echo -e "${RED}❌ Bun not found - installing...${NC}"
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
fi

echo -e "\n${YELLOW}3. Installing PM2 globally...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2 already installed${NC}"
else
    echo -e "${YELLOW}Installing PM2...${NC}"
    npm install -g pm2
    # Set up PM2 to start on boot
    pm2 startup systemd -u sammy --hp /home/sammy
fi

echo -e "\n${YELLOW}4. Checking Redis...${NC}"
if systemctl is-active --quiet redis-server; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis not running - installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
fi

echo -e "\n${YELLOW}5. Setting up deployment directory...${NC}"
# Create the deployment structure
mkdir -p ~/check
mkdir -p ~/check/uploads
mkdir -p ~/check/logs

echo -e "\n${YELLOW}6. Creating ecosystem.config.js for PM2...${NC}"
cat > ~/check/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "vibecheck-api",
      script: "bun",
      args: "run src/index.ts",
      cwd: "/home/sammy/check",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    },
    {
      name: "vibecheck-workers",
      script: "bun",
      args: "run src/workers/index.ts",
      cwd: "/home/sammy/check",
      env: {
        NODE_ENV: "production"
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M"
    }
  ]
};
EOF

echo -e "\n${YELLOW}7. Environment setup reminder...${NC}"
echo "Create /home/sammy/check/.env with:"
echo "  PORT=3001"
echo "  OPENAI_API_KEY=your-key"
echo "  REDIS_HOST=localhost"
echo "  REDIS_PORT=6379"
echo "  JWT_SECRET=your-secret"
echo "  APPLE_SHARED_SECRET=your-apple-secret"

echo -e "\n${GREEN}✅ Server setup complete!${NC}"
echo -e "\nNext steps:"
echo "1. Copy your .env file to ~/check/.env"
echo "2. Deploy your code via GitHub Actions"
echo "3. Start PM2: pm2 start ~/check/ecosystem.config.js"
echo "4. Save PM2 config: pm2 save" 