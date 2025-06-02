#!/bin/bash

# GitHub Actions Monitoring Script
# Provides real-time status of workflows and deployments

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 GitHub Actions Monitor${NC}"
echo "========================="

# Function to format status
format_status() {
    case $1 in
        "completed") echo -e "${GREEN}✅ Completed${NC}" ;;
        "success") echo -e "${GREEN}✅ Success${NC}" ;;
        "failure") echo -e "${RED}❌ Failed${NC}" ;;
        "in_progress") echo -e "${YELLOW}🔄 In Progress${NC}" ;;
        "queued") echo -e "${YELLOW}⏳ Queued${NC}" ;;
        *) echo "$1" ;;
    esac
}

# 1. Show latest workflow runs
echo -e "\n${YELLOW}📊 Latest Workflow Runs:${NC}"
gh run list --limit 5 --json databaseId,name,status,conclusion,createdAt,event | \
jq -r '.[] | "\(.name) | Status: \(.status) | Result: \(.conclusion // "pending") | Trigger: \(.event) | \(.createdAt)"'

# 2. Show current/recent deployment status
echo -e "\n${YELLOW}🚀 Recent Deployments:${NC}"
gh workflow view "Deploy to Production" | grep -A 5 "Recent runs" || echo "No deployment info available"

# 3. Get detailed status of the most recent run
echo -e "\n${YELLOW}📋 Most Recent Run Details:${NC}"
LATEST_RUN=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
if [ -n "$LATEST_RUN" ]; then
    gh run view $LATEST_RUN
fi

# 4. Check for any failures in the last 24 hours
echo -e "\n${YELLOW}⚠️  Failures in Last 24 Hours:${NC}"
FAILURES=$(gh run list --status failure --created ">$(date -u -v-24H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')" --json name,conclusion,createdAt)
if [ "$FAILURES" = "[]" ]; then
    echo -e "${GREEN}No failures in the last 24 hours${NC}"
else
    echo "$FAILURES" | jq -r '.[] | "❌ \(.name) failed at \(.createdAt)"'
fi

# 5. Interactive options
echo -e "\n${BLUE}🎮 Quick Actions:${NC}"
echo "1. View live logs: gh run watch"
echo "2. View specific run: gh run view <run-id>"
echo "3. Download artifacts: gh run download <run-id>"
echo "4. Re-run failed: gh run rerun <run-id> --failed"
echo "5. View in browser: gh run view <run-id> --web"

# 6. Server health check (optional)
echo -e "\n${YELLOW}🏥 Production Health Check:${NC}"
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://v.bkk.lol/health 2>/dev/null || echo "Failed")
if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Production server is healthy${NC}"
else
    echo -e "${RED}❌ Health check failed (Status: $HEALTH_CHECK)${NC}"
fi 