#!/bin/bash

# Script to test E2E test files
cd "$(dirname "$0")/.." || exit 1

echo "Testing E2E test files..."
echo "========================"

# Run each E2E test file individually to catch compilation errors
echo "1. Testing conversation flow..."
bun test src/e2e/conversation-flow.test.ts --no-coverage || echo "❌ Conversation flow test failed"

echo -e "\n2. Testing audio processing..."
bun test src/e2e/audio-processing.test.ts --no-coverage || echo "❌ Audio processing test failed"

echo -e "\n3. Testing auth flow..."
bun test src/e2e/auth-flow.test.ts --no-coverage || echo "❌ Auth flow test failed"

echo -e "\n4. Testing subscription flow..."
bun test src/e2e/subscription-flow.test.ts --no-coverage || echo "❌ Subscription flow test failed"

echo -e "\n========================"
echo "E2E test check complete!"