#!/bin/bash

echo "🔍 GitHub Actions Setup Verification"
echo "===================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "\n${YELLOW}📋 Required GitHub Secrets Checklist:${NC}"
echo "Go to: https://github.com/adimov-eth/vibecheck/settings/secrets/actions"
echo ""
echo "Add these secrets:"
echo "  [ ] OPENAI_API_KEY     - Your OpenAI API key (sk-proj-...)"
echo "  [ ] DEPLOY_KEY         - SSH private key (already generated)"
echo "  [ ] DEPLOY_HOST        - 165.232.180.34"
echo "  [ ] DEPLOY_USER        - sammy"
echo "  [ ] DEPLOY_PATH        - /home/sammy"

echo -e "\n${YELLOW}🔐 Your Deploy Key (if needed):${NC}"
echo "Location: ~/.ssh/vibecheck-deploy/deploy_key"
echo "To view: cat ~/.ssh/vibecheck-deploy/deploy_key"

echo -e "\n${YELLOW}🚀 Testing Deployment Connection:${NC}"
if ssh -o ConnectTimeout=5 -i ~/.ssh/vibecheck-deploy/deploy_key sammy@165.232.180.34 "echo 'Connected!'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ SSH connection failed - check your deploy key${NC}"
fi

echo -e "\n${YELLOW}📊 Current Git Status:${NC}"
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo "Remote URL: $(git remote get-url origin)"

echo -e "\n${YELLOW}🎯 Next Actions:${NC}"
echo "1. Ensure all GitHub secrets are added"
echo "2. Create a Pull Request:"
echo "   https://github.com/adimov-eth/vibecheck/pull/new/test/ci-check-1748820138"
echo "3. Watch CI run in Actions tab"
echo "4. After CI passes, merge to deploy"

echo -e "\n${YELLOW}📱 Mobile App Configuration:${NC}"
echo "Don't forget to update vibe/.env with:"
echo "  EXPO_PUBLIC_API_URL=https://v.bkk.lol"
echo "  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-key>" 