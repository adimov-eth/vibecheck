#!/bin/bash

# GitHub Actions Testing Script
# Run this to test your CI/CD pipeline

echo "🧪 GitHub Actions Testing Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if workflows exist
echo -e "\n${YELLOW}Test 1: Checking workflow files...${NC}"
if [ -f ".github/workflows/ci.yml" ] && [ -f ".github/workflows/deploy-production.yml" ]; then
    echo -e "${GREEN}✅ Workflow files exist${NC}"
else
    echo -e "${RED}❌ Workflow files missing${NC}"
    exit 1
fi

# Test 2: Validate workflow syntax
echo -e "\n${YELLOW}Test 2: Validating workflow syntax...${NC}"
# This would require actionlint or similar tool
echo "⚠️  Install 'actionlint' for syntax validation"

# Test 3: Check required secrets
echo -e "\n${YELLOW}Test 3: Required GitHub Secrets...${NC}"
echo "Ensure these secrets are set in your repository:"
echo "  - OPENAI_API_KEY"
echo "  - DEPLOY_KEY (SSH private key)"
echo "  - DEPLOY_HOST (165.232.180.34)"
echo "  - DEPLOY_USER (sammy)"
echo "  - DEPLOY_PATH (/home/sammy)"

# Test 4: Create a test branch for CI
echo -e "\n${YELLOW}Test 4: Creating test branch for CI...${NC}"
BRANCH_NAME="test/ci-check-$(date +%s)"
git checkout -b "$BRANCH_NAME"
echo "# CI Test $(date)" >> README.md
git add README.md
git commit -m "test: CI pipeline verification"
echo -e "${GREEN}✅ Created branch: $BRANCH_NAME${NC}"
echo "Run: git push origin $BRANCH_NAME"

# Test 5: Server connectivity (if you have SSH access)
echo -e "\n${YELLOW}Test 5: Server connectivity test...${NC}"
if command -v ssh &> /dev/null; then
    echo "Testing SSH connection to sammy@165.232.180.34..."
    echo "Run: ssh sammy@165.232.180.34 'echo Connected successfully'"
else
    echo "⚠️  SSH not available for testing"
fi

echo -e "\n${GREEN}📋 Next Steps:${NC}"
echo "1. Push the test branch to trigger CI:"
echo "   git push origin $BRANCH_NAME"
echo "2. Create a PR to main branch"
echo "3. Check GitHub Actions tab for CI run"
echo "4. After PR is merged, check deployment workflow"

echo -e "\n${YELLOW}Monitor at:${NC}"
echo "https://github.com/[your-username]/[your-repo]/actions" 