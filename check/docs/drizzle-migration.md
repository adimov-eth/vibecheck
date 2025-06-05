# Drizzle ORM Migration Guide

## Overview

We're migrating from raw SQL queries to Drizzle ORM to improve type safety, reduce SQL injection risks, and simplify database operations. This migration uses a feature flag approach for zero-downtime deployment.

## Why Drizzle?

- **Type Safety**: Full TypeScript support with inferred types
- **Bun Compatible**: Works seamlessly with Bun runtime
- **Lightweight**: No heavy CLI or separate process required
- **SQL-like**: Easy transition from raw SQL
- **Performance**: Minimal overhead compared to raw queries

## Migration Strategy

### Phase 1: Parallel Implementation (Current)
- Drizzle schema defined alongside existing database
- Adapter pattern provides unified interface
- Feature flag `USE_DRIZZLE` controls which implementation is used
- Both systems run in parallel for testing

### Phase 2: Gradual Rollout
1. Deploy with `USE_DRIZZLE=false` (default)
2. Enable for development/staging
3. Enable for 10% of production traffic
4. Monitor performance and errors
5. Gradually increase to 100%

### Phase 3: Cleanup
- Remove legacy SQL code
- Remove adapter layer
- Use Drizzle directly

## Implementation

### 1. Install Dependencies

```bash
cd check
bun add drizzle-orm
bun add -d drizzle-kit
```

### 2. Configure Drizzle

Create `drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite', // Change to 'postgresql' for production
  dbCredentials: {
    url: './app.db',
  },
} satisfies Config;
```

### 3. Define Schema

See `src/database/schema.ts` for complete schema definition.

### 4. Use the Adapter

```typescript
import { adapter } from '@/database/adapter';

// Find user
const user = await adapter.findUserById(userId);

// Create conversation
await adapter.createConversation({
  id: generateId(),
  userId,
  mode: 'vent',
});

// Update with type safety
await adapter.updateConversation(id, {
  status: 'completed',
  gptResponse: 'AI response here',
});
```

### 5. Enable Drizzle

```bash
# Development
USE_DRIZZLE=true bun dev

# Production (gradual rollout)
USE_DRIZZLE=true bun start
```

## Service Migration Example

Before (Raw SQL):
```typescript
const conversation = await queryOne<ConversationRow>(
  'SELECT * FROM conversations WHERE id = ?',
  [id]
);
```

After (Drizzle Adapter):
```typescript
const conversation = await adapter.findConversationById(id);
```

With direct Drizzle (Phase 3):
```typescript
const conversation = await drizzleDb
  .select()
  .from(conversations)
  .where(eq(conversations.id, id))
  .limit(1);
```

## Monitoring

Check migration status:
```bash
bun src/scripts/migrate-to-drizzle.ts
```

## Performance Considerations

- Drizzle adds ~5-10% overhead vs raw SQL
- Query builder provides better caching opportunities
- Type safety prevents runtime errors
- Prepared statements are automatically used

## Rollback Plan

If issues arise:
1. Set `USE_DRIZZLE=false` in environment
2. Restart services
3. System reverts to raw SQL immediately
4. No data migration required

## Next Steps

1. Update all services to use adapter
2. Add Drizzle-specific indexes
3. Implement connection pooling
4. Add query result caching
5. Migrate to PostgreSQL using same pattern