#!/bin/bash

echo "🔐 Generating SSH Deploy Key for GitHub Actions"
echo "=============================================="

# Generate SSH key
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"

echo -e "\n✅ SSH key generated!"
echo -e "\n📋 Follow these steps:"
echo "1. Copy the PRIVATE key to GitHub Secrets as DEPLOY_KEY:"
echo "   cat deploy_key"
echo ""
echo "2. Copy the PUBLIC key to your server:"
echo "   ssh-copy-id -i deploy_key.pub sammy@165.232.180.34"
echo "   OR manually add to ~/.ssh/authorized_keys on server"
echo ""
echo "3. Test the connection:"
echo "   ssh -i deploy_key sammy@165.232.180.34 'echo Connected!'"
echo ""
echo "⚠️  Keep deploy_key private and secure!"
echo "⚠️  Add deploy_key* to .gitignore if not already there" 