#!/bin/bash

# VibeCheck Development Environment Startup Script
# This script starts all required services for local development

set -e

echo "🚀 Starting VibeCheck Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed. Please install it first.${NC}"
        exit 1
    fi
}

echo "🔍 Checking prerequisites..."
check_command bun
check_command pnpm
check_command redis-cli

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis is not running. Starting Redis...${NC}"
    redis-server --daemonize yes
    sleep 2
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down development environment...${NC}"
    
    # Kill processes if they exist
    [[ -n $BACKEND_PID ]] && kill $BACKEND_PID 2>/dev/null || true
    [[ -n $WORKERS_PID ]] && kill $WORKERS_PID 2>/dev/null || true
    [[ -n $FRONTEND_PID ]] && kill $FRONTEND_PID 2>/dev/null || true
    
    echo -e "${GREEN}✅ Development environment stopped${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start backend API
echo -e "${GREEN}📡 Starting backend API server...${NC}"
cd check
bun run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null; then
        echo -e "${GREEN}✅ Backend API is ready${NC}"
        break
    fi
    sleep 1
done

# Start workers
echo -e "${GREEN}⚙️  Starting background workers...${NC}"
cd check
bun run workers &
WORKERS_PID=$!
cd ..

# Start frontend
echo -e "${GREEN}📱 Starting Expo development server...${NC}"
cd vibe
pnpm start &
FRONTEND_PID=$!
cd ..

# Display status
echo -e "\n${GREEN}✅ Development environment started!${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Backend API:    http://localhost:3000"
echo -e "Backend PID:    $BACKEND_PID"
echo -e "Workers PID:    $WORKERS_PID"
echo -e "Frontend PID:   $FRONTEND_PID"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Monitor services
while true; do
    # Check if processes are still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Backend API crashed!${NC}"
        break
    fi
    if ! kill -0 $WORKERS_PID 2>/dev/null; then
        echo -e "${RED}❌ Workers crashed!${NC}"
        break
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Frontend crashed!${NC}"
        break
    fi
    sleep 5
done

# Wait for any remaining processes
wait 