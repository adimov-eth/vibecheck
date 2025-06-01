# VibeCheck - Conversation Intelligence Platform

VibeCheck is a conversation intelligence platform that records, transcribes, and analyzes conversations using AI to provide relationship insights.

## 🚀 Quick Start

### Prerequisites

- **Bun** v1.2.9+ (Backend runtime) - [Install Bun](https://bun.sh)
- **pnpm** v10.6.3+ (Frontend package manager) - `npm install -g pnpm`
- **Redis** 6.0+ (Caching & job queues) - [Install Redis](https://redis.io/download)
- **Node.js** 18+ (For Expo CLI)
- **Xcode** (iOS development) or **Android Studio** (Android development)

### Backend Setup (API Server)

1. Navigate to the backend directory:
   ```bash
   cd check
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up environment variables:
   - Copy `env.example` to `.env`
   - Update the values with your credentials

4. Initialize the database:
   ```bash
   bun run db:migrate
   ```

5. Start the API server:
   ```bash
   bun run dev
   ```

6. In a separate terminal, start the background workers:
   ```bash
   bun run workers
   ```

The API server will be running at `http://localhost:3000`

### Frontend Setup (Mobile App)

1. Navigate to the frontend directory:
   ```bash
   cd vibe
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   - Copy `env.example` to `.env`
   - Update `EXPO_PUBLIC_API_URL` to point to your backend

4. Start the Expo development server:
   ```bash
   pnpm start
   ```

5. Run on your device:
   - **iOS**: Press `i` to open iOS simulator
   - **Android**: Press `a` to open Android emulator
   - **Physical device**: Scan QR code with Expo Go app

## 🔧 Configuration

### Required Environment Variables

#### Backend (`check/.env`)
- `OPENAI_API_KEY` - Your OpenAI API key for transcription and analysis
- `APPLE_SHARED_SECRET` - Apple App Store shared secret for subscription verification
- `JWT_SECRET` - Secure random string (min 32 chars) for JWT signing
- `REDIS_HOST` / `REDIS_PORT` - Redis connection details

#### Frontend (`vibe/.env`)
- `EXPO_PUBLIC_API_URL` - Backend API URL (e.g., `http://localhost:3000`)
- `APPLE_SHARED_SECRET` - Same as backend for receipt validation

## 📱 Features

- **Apple Sign-In** authentication
- **Audio Recording** with visual feedback
- **AI Transcription** using OpenAI Whisper
- **Conversation Analysis** with GPT-4
- **In-App Purchases** for premium subscriptions
- **Real-time Updates** via WebSocket
- **Background Upload** support

## 🧪 Testing

### API Health Check
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### Test Authentication Flow
1. Open the mobile app
2. Sign in with Apple ID
3. Verify JWT token is stored

### Test Recording Flow
1. Select a conversation mode
2. Record audio (separate or live)
3. Check upload progress
4. Verify analysis results

3. **Test the setup**:
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Check OpenAI API status
   cd check && bun run check:openai
   ```

## 🐛 Troubleshooting

### Common Issues

**Redis Connection Failed**
- Ensure Redis is running: `redis-cli ping`
- Check Redis host/port in `.env`

**Database Locked Error**
- Delete SQLite WAL files: `rm check/app.db-*`
- Restart the backend server

**OpenAI API Errors**
- Verify API key is valid
- Check API quota/limits: `cd check && bun run check:openai`
- Review error logs
- If you see 429 errors (quota exceeded):
  - Check your usage at https://platform.openai.com/usage
  - Upgrade your OpenAI plan if needed
  - Wait for rate limits to reset
  - The backend now preserves files on quota errors for retry

**Mobile App Can't Connect**
- Ensure backend is running
- Check `EXPO_PUBLIC_API_URL` is correct
- Verify firewall/network settings

**Audio Upload Failures**
- Check `uploads/` directory permissions
- Verify disk space available
- Review worker logs

### Logs

Backend logs are output to console. For production, consider:
```bash
bun run start 2>&1 | tee app.log
```

## 🚀 Production Deployment

### Recommended Changes
1. **Database**: Migrate from SQLite to PostgreSQL
2. **File Storage**: Use S3/CloudFlare R2 instead of local storage
3. **Redis**: Set up Redis cluster for high availability
4. **Environment**: Use proper secret management (AWS Secrets Manager, etc.)
5. **Monitoring**: Add APM tools (Datadog, New Relic, etc.)

### Security Checklist
- [ ] Rotate all secrets and API keys
- [ ] Enable HTTPS with SSL certificates
- [ ] Configure CORS for production domains
- [ ] Set up rate limiting rules
- [ ] Enable request/response logging
- [ ] Configure backup strategies

## 📊 API Documentation

### Authentication
All API endpoints (except `/health` and `/auth/*`) require JWT authentication:
```
Authorization: Bearer <JWT_TOKEN>
```

### Key Endpoints
- `POST /auth/apple` - Apple Sign-In
- `POST /conversations` - Create conversation
- `GET /conversations` - List conversations
- `POST /conversations/:id/audio/:audioKey` - Upload audio
- `GET /subscriptions/status` - Check subscription
- `WebSocket /ws` - Real-time updates

## 🤝 Support

For issues or questions:
1. Check the troubleshooting guide above
2. Review logs for error details
3. Check `PROJECT_STATUS_REPORT.md` for detailed architecture info

## 📄 License

Copyright © 2025 - All rights reserved # CI Test Mon Jun  2 06:20:53 +07 2025
