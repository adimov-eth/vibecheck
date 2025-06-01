# Digital Ocean Server Setup Questionnaire

Please provide the following information about your Digital Ocean server to configure GitHub Actions deployment:

## 1. Server Access & Authentication

```yaml
# Current server details:
server_ip: # e.g., 165.232.150.123 or v.bkk.lol
ssh_user: # e.g., sammy, root, deploy
ssh_port: # default is 22
```

**Questions:**
- [ ] Do you have SSH key authentication set up? (not password auth)
- [ ] Should we create a dedicated deploy user or use existing user?
- [ ] Are there any IP restrictions for SSH access?

## 2. Software & Runtime Environment

**Currently Installed? (Yes/No/Version):**
- [ ] Bun (required version: 1.2.9+): _______
- [ ] Node.js: _______
- [ ] PM2: _______
- [ ] Redis: _______
- [ ] Git: _______
- [ ] Nginx (or other reverse proxy): _______
- [ ] Certbot/Let's Encrypt: _______

## 3. Directory Structure

```bash
# Current or desired structure:
/home/{user}/
  ├── check/           # Backend directory
  │   ├── .env         # Environment file location
  │   ├── uploads/     # File uploads directory
  │   ├── logs/        # Log files directory
  │   └── app.db       # SQLite database
  └── .pm2/            # PM2 config location
```

**Questions:**
- [ ] What's the full path to deployment directory? ________________
- [ ] Do these directories exist with proper permissions?
- [ ] Who should own the application files? (user:group)

## 4. Network Configuration

**Open Ports:**
- [ ] 22 (SSH)
- [ ] 80 (HTTP)
- [ ] 443 (HTTPS)
- [ ] 3001 (API - based on your PM2 config)
- [ ] 6379 (Redis - localhost only?)

**Domain Configuration:**
- [ ] Domain name: ________________
- [ ] SSL certificate installed?
- [ ] Nginx configured as reverse proxy?

## 5. Current Deployment Process

**How are you currently deploying?**
- [ ] Manual (SSH + git pull)
- [ ] PM2 deploy
- [ ] Other: ________________

**Current PM2 apps running:**
```bash
# Output of: pm2 list
```

## 6. Environment Variables

**How are environment variables managed?**
- [ ] .env file on server
- [ ] PM2 ecosystem file
- [ ] System environment
- [ ] Other: ________________

**Required environment variables:**
```env
NODE_ENV=production
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=
OPENAI_API_KEY=
JWT_SECRET=
APPLE_SHARED_SECRET=
```

## 7. Database & Storage

**Database:**
- [ ] Using SQLite (current)
- [ ] Plan to migrate to PostgreSQL
- [ ] Database backup strategy?

**File Storage:**
- [ ] Local filesystem (current)
- [ ] Plan to use object storage (S3/Spaces)?
- [ ] Current disk space available?

## 8. Monitoring & Logs

**Current setup:**
- [ ] PM2 logs location: ________________
- [ ] Log rotation configured?
- [ ] Monitoring service (Datadog, New Relic, etc.)?
- [ ] Alerts configured?

## 9. Security Considerations

**Current security measures:**
- [ ] Firewall configured (ufw/iptables)?
- [ ] Fail2ban installed?
- [ ] Automatic security updates?
- [ ] SSH hardening (key-only, non-root)?

## 10. Backup & Recovery

**Backup strategy:**
- [ ] Database backups frequency: ________________
- [ ] Backup location: ________________
- [ ] Disaster recovery plan?

---

## Additional Information Needed

1. **GitHub Secrets Required:**
   - `DEPLOY_HOST` - Your server IP/domain
   - `DEPLOY_USER` - SSH username  
   - `DEPLOY_KEY` - Private SSH key
   - `DEPLOY_PATH` - Full deployment path
   - All environment variables for production

2. **Deployment Preferences:**
   - Blue-green deployment?
   - Zero-downtime requirement?
   - Rollback strategy?
   - Deployment notifications (Slack, email)?

3. **Performance Requirements:**
   - Expected concurrent users?
   - Memory limits for processes?
   - CPU allocation preferences?

Please fill out this questionnaire so I can create the optimal GitHub Actions deployment workflow for your setup! 

# Check the current status
cd ~/check
pm2 status

# View recent logs
pm2 logs --lines 50

# Check if .env exists
ls -la .env

# Test Redis connection
redis-cli ping

# Check disk space
df -h

# Check memory usage
free -m 