# PostgreSQL Migration Guide

## Overview
This guide documents the migration from SQLite to PostgreSQL for the VibeCheck backend. The migration is designed to be zero-downtime with a gradual rollover strategy.

## Architecture
The migration uses:
- **Drizzle ORM** for both SQLite and PostgreSQL support
- **Unified Database Adapter** for seamless switching between databases
- **Feature flags** to control database selection
- **Migration scripts** for data transfer

## Prerequisites
1. PostgreSQL 15+ installed locally or accessible remotely
2. Database and user created:
```sql
CREATE DATABASE vibecheck_dev;
CREATE DATABASE vibecheck_test;
CREATE USER vibecheck_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE vibecheck_dev TO vibecheck_user;
GRANT ALL PRIVILEGES ON DATABASE vibecheck_test TO vibecheck_user;
```

## Configuration
Set these environment variables in your `.env` file:
```bash
# Enable PostgreSQL
DATABASE_TYPE=postgres
POSTGRES_URL=postgresql://vibecheck_user:password@localhost:5432/vibecheck_dev

# Keep SQLite as fallback (optional)
SQLITE_URL=./app.db
```

## Migration Steps

### 1. Generate PostgreSQL Schema
```bash
bun run db:generate:postgres
```

### 2. Push Schema to PostgreSQL
```bash
bun run db:push:postgres
```

### 3. Verify Schema
```bash
bun run db:studio:postgres
```

### 4. Dry Run Migration
Test the migration without making changes:
```bash
bun run db:migrate:postgres:dry
```

### 5. Run Migration
Execute the actual data migration:
```bash
bun run db:migrate:postgres
```

### 6. Verify Migration
Check that all data was migrated correctly:
```bash
bun run db:migrate:postgres:verify
```

## Database Schema Changes

### New Tables in PostgreSQL
1. **sessions** - JWT session tracking
2. **usage_records** - Usage tracking and analytics

### Type Conversions
- SQLite integers (0/1) → PostgreSQL booleans
- Unix timestamps → PostgreSQL timestamps with timezone
- Text enums → PostgreSQL enum types

### PostgreSQL Enums
- `conversation_mode`: therapy, coaching, interview, journal, conversation
- `recording_type`: separate, live, microphone
- `conversation_status`: waiting, uploading, transcribing, analyzing, completed, failed, processing
- `audio_status`: uploaded, processing, transcribed, failed

## Code Changes

### Using the Unified Adapter
```typescript
import { unifiedAdapter } from '@/database/unified-adapter';

// Works with both SQLite and PostgreSQL
const user = await unifiedAdapter.findUserByEmail('user@example.com');
const conversations = await unifiedAdapter.findUserConversations(userId);
```

### Direct PostgreSQL Access
```typescript
import { pgDb, users } from '@/database/drizzle.postgres';
import { eq } from 'drizzle-orm';

// PostgreSQL-specific features
const result = await pgDb.select()
  .from(users)
  .where(eq(users.email, 'user@example.com'));
```

## Rollback Strategy
1. Keep `DATABASE_TYPE=sqlite` in environment
2. Application automatically uses SQLite
3. No code changes required

## Performance Improvements
- Connection pooling (max 20 connections)
- Prepared statements via Drizzle
- Optimized indexes for common queries
- PostgreSQL-specific features (JSONB, full-text search)

## Monitoring
- Connection pool metrics available
- Query performance logging for slow queries (>1s)
- Health check endpoint includes database status

## Production Deployment
1. Set up PostgreSQL on production server
2. Run migrations with monitoring
3. Gradually switch traffic using feature flags
4. Monitor performance and errors
5. Complete switchover when stable

## Troubleshooting

### Connection Issues
```bash
# Test connection
psql -h localhost -U vibecheck_user -d vibecheck_dev

# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log
```

### Migration Failures
- Check PostgreSQL error logs
- Verify foreign key constraints
- Ensure enum values are valid
- Run with smaller batch size: `--batch-size=10`

### Performance Issues
- Check connection pool usage
- Review slow query logs
- Verify indexes are being used
- Consider increasing pool size

## Next Steps
After successful migration:
1. Remove SQLite dependencies (keep for tests)
2. Implement PostgreSQL-specific features
3. Set up replication for high availability
4. Configure automated backups