# VibeCheck Server

The server component for the VibeCheck application, providing API endpoints for audio analysis, user management, and subscription handling.

## Getting Started

To install dependencies:

```bash
bun install
```

To run the server:

```bash
bun run index.ts
```

For development with auto-reload:

```bash
bun --watch index.ts
```

## Workers

Start the background processing workers:

```bash
bun src/workers/audio.worker.ts & bun src/workers/gpt.worker.ts
```

## Database

Run database migrations:

```bash
bun src/database/migrate.ts
```

Clean stale queue items:

```bash
bun src/scripts/clean-queues.ts
```

## Documentation

- [API Documentation](./docs/api-documentation.md) - Complete REST API reference
- [WebSocket API](./docs/websocket-api.md) - Real-time communication protocol
- [Subscription Verification](./docs/subscription-verification.md) - In-app purchase verification
- [Usage Limits](./docs/usage-limits.md) - Freemium model implementation

## Technology Stack

- [Bun](https://bun.sh) - JavaScript runtime
- [Express](https://expressjs.com/) - Web framework
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
- [Clerk](https://clerk.com/) - Authentication

This project was created using `bun init` in bun v1.1.26.
