#!/bin/bash

# VibeCheck Deployment Verification Script
# Run this after deployment to verify everything is working

set -e

echo "🔍 Verifying VibeCheck Deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
API_PORT="${PORT:-3001}"
API_URL="http://localhost:${API_PORT}"

# Function to check HTTP endpoint
check_endpoint() {
    local endpoint=$1
    local expected_status=$2
    local description=$3
    
    echo -ne "${YELLOW}Checking ${description}...${NC} "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}${endpoint}" || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ OK (${response})${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL (${response})${NC}"
        return 1
    fi
}

# Check PM2 processes
echo -e "${YELLOW}Checking PM2 processes...${NC}"
pm2_status=$(pm2 list --json 2>/dev/null || echo "[]")

check_process() {
    local name=$1
    if echo "$pm2_status" | grep -q "\"name\":\"$name\"" && \
       echo "$pm2_status" | grep -q "\"status\":\"online\""; then
        echo -e "${GREEN}✓ $name is online${NC}"
    else
        echo -e "${RED}✗ $name is not online${NC}"
        return 1
    fi
}

check_process "vibecheck-api"
check_process "vibecheck-audio-worker"
check_process "vibecheck-gpt-worker"
check_process "vibecheck-notification-worker"
check_process "vibecheck-cleanup-worker"

# Check Redis
echo -ne "${YELLOW}Checking Redis connection...${NC} "
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Connected${NC}"
else
    echo -e "${RED}✗ Not connected${NC}"
fi

# Check API endpoints
echo -e "\n${YELLOW}Checking API endpoints...${NC}"
check_endpoint "/health" "200" "Health endpoint"
check_endpoint "/api/v1/auth/apple" "405" "Auth endpoint (should reject GET)"

# Check file permissions
echo -e "\n${YELLOW}Checking file permissions...${NC}"
for dir in logs uploads; do
    if [ -w "$dir" ]; then
        echo -e "${GREEN}✓ $dir is writable${NC}"
    else
        echo -e "${RED}✗ $dir is not writable${NC}"
    fi
done

# Check database
echo -ne "${YELLOW}Checking database connection...${NC} "
if [ -f "app.db" ] && [ -r "app.db" ] && [ -w "app.db" ]; then
    echo -e "${GREEN}✓ Database accessible${NC}"
else
    echo -e "${RED}✗ Database not accessible${NC}"
fi

# Check environment variables
echo -e "\n${YELLOW}Checking critical environment variables...${NC}"
check_env() {
    local var=$1
    if grep -q "^${var}=" .env 2>/dev/null; then
        echo -e "${GREEN}✓ $var is set${NC}"
    else
        echo -e "${RED}✗ $var is not set${NC}"
    fi
}

check_env "OPENAI_API_KEY"
check_env "REDIS_HOST"
check_env "REDIS_PORT"
check_env "JWT_SECRET"
check_env "APPLE_SHARED_SECRET"

echo -e "\n${GREEN}Deployment verification complete!${NC}" 