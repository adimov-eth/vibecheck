# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeCheck is a conversation intelligence platform with a React Native mobile app and Bun-powered backend API. The system records conversations, transcribes them via OpenAI, analyzes them with GPT, and delivers insights through real-time WebSocket connections.

**Architecture**: Mobile App → Backend API → Redis Queue → Workers → WebSocket/Push Notifications

## Commands

### Backend (check directory)
- `cd check && bun install` - Install dependencies  
- `cd check && bun run dev` - Start dev server with auto-reload (port 3000)
- `cd check && bun run workers` - Start background workers (audio, GPT, cleanup)
- `cd check && bun run db:migrate` - Run database migrations
- `cd check && bun run lint` - Run ESLint
- `cd check && bun test -- -t "test name"` - Run specific test
- `cd check && bun run check:openai` - Verify OpenAI API connection
- `cd check && bun run clean-queues` - Clean Redis job queues

### Frontend (vibe directory)  
- `cd vibe && pnpm install` - Install dependencies
- `cd vibe && pnpm start` - Start Expo development server
- `cd vibe && pnpm lint` - Run linter
- `cd vibe && pnpm test -- -t "test name"` - Run specific test

## Architecture Patterns

### Backend Services Layer
- **Services**: Business logic in `/src/services/` (user-service, conversation-service, etc.)
- **Workers**: Background processing in `/src/workers/` using BullMQ queues
- **Database**: SQLite with migrations in `/src/database/` (production uses PostgreSQL)
- **WebSocket**: Real-time updates via `/utils/websocket/` with Redis pub/sub
- **Middleware**: Auth, rate limiting, error handling in `/src/middleware/`

### Frontend State Management  
- **Zustand Store**: Modular slices in `/state/slices/` (conversation, upload, websocket, subscription)
- **Custom Hooks**: Business logic in `/hooks/` (useConversation, useRecording, useWebSocket)
- **Background Uploads**: Persistent queue using expo-file-system and expo-task-manager

### Key Data Flow
1. **Recording**: Local audio capture → Background upload queue → Object storage
2. **Processing**: Redis job queues → OpenAI transcription → GPT analysis  
3. **Delivery**: WebSocket real-time updates → Push notifications

## Technology Choices

### Backend Stack
- **Runtime**: Bun (fast JavaScript runtime)
- **Framework**: Express-like API with TypeScript
- **Database**: SQLite (dev) / PostgreSQL (prod) with custom migration system
- **Queue**: Redis + BullMQ for reliable background processing
- **Auth**: Apple Sign-In with JWT sessions

### Frontend Stack  
- **Framework**: React Native with Expo (~52.0.40)
- **Navigation**: Expo Router for file-based routing
- **State**: Zustand for simple, performant state management
- **Audio**: expo-av for recording with real-time visualization
- **Background**: expo-task-manager for reliable upload processing

## Code Conventions

### General
- **TypeScript**: Strict mode, avoid `any` type
- **Naming**: PascalCase (components/types), camelCase (variables/functions), kebab-case (files)
- **Imports**: Group by source (third-party first, then internal with `@/*` aliases)
- **Error Handling**: Use try/catch with proper error types (AppError classes)
- **Async**: Always use async/await (never raw Promises)

### Backend Patterns
- **Validation**: Zod schemas for input validation
- **Logging**: Winston logger for structured logging
- **Database**: Prisma-style patterns with explicit transactions
- **Workers**: Robust error handling with retry logic and status updates

### Frontend Patterns  
- **State**: Zustand slices with immer for immutable updates
- **API**: Centralized apiClient with error handling and auth injection
- **Components**: Small, focused components with TypeScript props
- **Hooks**: Custom hooks for business logic, not just data fetching

## Environment Setup

### Required Services
- **Redis**: For caching and job queues (localhost:6379)
- **OpenAI API**: For transcription and analysis (requires API key)

### Environment Variables
```bash
# Backend (.env)
OPENAI_API_KEY=sk-proj-...
REDIS_HOST=localhost
REDIS_PORT=6379
APPLE_SHARED_SECRET=...
JWT_SECRET=...

# Frontend (.env)  
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Development Workflow

### Testing Strategy
- **Health Check**: `curl http://localhost:3000/health` 
- **OpenAI Status**: `cd check && bun run check:openai`
- **Queue Status**: Check Redis with `redis-cli` for bull: keys

### Common Issues
- **Database Locked**: Delete SQLite WAL files `rm check/app.db-*`
- **Redis Connection**: Verify Redis service with `redis-cli ping`
- **OpenAI Quota**: Check usage at platform.openai.com/usage
- **Upload Failures**: Check `uploads/` directory permissions

### Background Processing
The system uses a reliable queue-based architecture:
- Audio uploads → transcription queue → analysis queue → notification delivery
- All job failures are retried with exponential backoff
- Status updates are broadcast via Redis pub/sub to WebSocket clients

## Important Notes

- **Apple Sign-In**: Uses JWS verification with cached Apple public keys
- **Subscription**: Apple S2S webhooks for real-time subscription updates  
- **Background Uploads**: Persist across app restarts using expo-task-manager
- **Real-time Updates**: WebSocket subscriptions with Redis pub/sub backing
- **File Handling**: Streams audio directly to object storage (no memory loading)