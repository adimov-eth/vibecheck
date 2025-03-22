# VibeCheck Development Guide

## Build Commands
- **App**: `cd app && pnpm start` - Start Expo development server
- **App Testing**: `cd app && pnpm test` - Run Jest tests
- **Single Test**: `cd app && pnpm test -- -t "test name"` or `pnpm test -- path/to/test-file.js`
- **App Linting**: `cd app && pnpm lint` - Run ESLint
- **Server**: `cd server && bun index.ts` - Start server
- **Server Dev**: `cd server && bun --watch index.ts` - Start server with auto-reload
- **Workers**: `cd server && bun src/workers/audio.worker.ts & bun src/workers/gpt.worker.ts` - Run workers
- **Database**: `cd server && bun src/database/migrate.ts` - Run migrations
- **Clean Queues**: `cd server && bun src/scripts/clean-queues.ts` - Clean stale queue items

## Code Style Guidelines
- **TypeScript**: Use strict type checking (`strict: true`)
- **App Imports**: Use path alias `@/*` for imports, organize imports by type/source
- **Server Imports**: Use ES Modules format with named exports
- **Formatting**: Consistent indentation (2 spaces), semicolons required
- **Naming**: camelCase for variables/functions, PascalCase for components/classes/types
- **Components**: Modular, reusable with typed props interfaces (React.FC<Props>)
- **Error Handling**: try/catch blocks for async operations, use error-logger.ts utility
- **Design System**: Follow app/docs/design.md for UI components and styling
- **Documentation**: Document complex logic and component APIs with JSDoc comments
- **Routing**: Use Expo Router's file-based routing (app directory)
- **State Management**: Use React Context for global state (see contexts/ directory)
- **API Calls**: Handle loading/error states, use useAPI hook and apiService utility