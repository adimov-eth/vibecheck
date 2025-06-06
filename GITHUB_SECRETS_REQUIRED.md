# GitHub Secrets Required for CI/CD

Go to: https://github.com/adimov-eth/vibecheck/settings/secrets/actions

Add these repository secrets:

## Deployment Secrets
- `DEPLOY_HOST` = `v.bkk.lol`
- `DEPLOY_USER` = `sammy`
- `DEPLOY_PATH` = `/home/sammy/vibecheck`
- `DEPLOY_KEY` = [SSH private key - see instructions below]

## Application Secrets
- `OPENAI_API_KEY` = [Get from https://platform.openai.com/api-keys]
- `APPLE_SHARED_SECRET` = [Get from App Store Connect > Apps > Your App > App Information > App-Specific Shared Secret]
- `JWT_SECRET` = [Generate a secure random string, at least 32 characters]

## Getting the Deploy Key

Option 1: If you have the existing key locally:
```bash
cat ~/.ssh/vibecheck-deploy/deploy_key
```

Option 2: Generate a new deploy key pair:
```bash
# Generate new key
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"

# Add public key to server
ssh sammy@165.232.180.34 "echo '$(cat deploy_key.pub)' >> ~/.ssh/authorized_keys"

# Copy private key content
cat deploy_key
# Copy this entire content (including -----BEGIN and -----END lines) to DEPLOY_KEY secret

# Clean up local files
rm deploy_key deploy_key.pub
```

## Optional Secrets (if using features)
- `SVIX_API_KEY` = [If using Svix for webhooks]
- `REDIS_PASSWORD` = [If Redis requires authentication]

## Notes
- The server already has these secrets configured in `/home/sammy/vibecheck/check/.env`
- You can get the existing values by SSHing to the server if you have access
- JWT_SECRET should be a long random string (use `openssl rand -base64 32` to generate)
- Make sure DEPLOY_KEY includes the full private key with header/footer lines