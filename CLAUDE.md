# VibeCheck Development Guide

## Build Commands
- **App**: `cd app && pnpm start` - Start Expo development server
- **App Testing**: `cd app && pnpm test` - Run Jest tests
- **App Linting**: `cd app && pnpm lint` - Run ESLint
- **Server**: `cd server && bun index.ts` - Start server
- **Server Dev**: `cd server && bun --watch index.ts` - Start server with auto-reload
- **Workers**: `cd server && bun src/workers/audio.worker.ts` - Run audio processing worker
- **Database**: `cd server && bun src/database/migrate.ts` - Run migrations

## Code Style Guidelines
- **TypeScript**: Use strict type checking (`strict: true`)
- **App Imports**: Use path alias `@/*` for imports
- **Naming**: CamelCase for variables, PascalCase for components/classes
- **Components**: Modular, reusable with clear props interfaces
- **Error Handling**: Proper try/catch blocks, especially for async operations
- **Design System**: Follow app/docs/design.md for UI components and styling
- **Documentation**: Document complex logic and component APIs
- **Routing**: Use Expo Router's file-based routing (app directory)
- **State Management**: Use React Context for global state
- **API Calls**: Handle loading/error states, use apiService utility