# Redis Caching Implementation

## Overview
We've implemented a comprehensive Redis caching layer to improve performance, reduce database load, and enhance user experience. The implementation follows a layered architecture with automatic cache invalidation and warming strategies.

## Architecture

### Core Components

1. **CacheService** (`/src/services/cache/cache-service.ts`)
   - Main Redis client wrapper with connection pooling
   - Automatic compression for large values (>1KB)
   - TTL management with configurable defaults
   - Tag-based invalidation support
   - Built-in statistics tracking (hits, misses, errors)
   - Graceful degradation when Redis is unavailable

2. **Domain-Specific Cache Services**
   - `UserCacheService`: User profile and authentication caching
   - `SessionCacheService`: Session token caching with expiration
   - `ConversationCacheService`: Conversation data with status-based TTL
   - `OpenAICacheService`: AI response caching (transcriptions, analyses)

3. **Cache Middleware** (`/src/middleware/cache.ts`)
   - Route-level response caching
   - User-aware caching with automatic key generation
   - Cache invalidation on mutations
   - Cache control headers

4. **Cache Warming** (`/src/services/cache/cache-warmer.ts`)
   - Scheduled jobs for popular data
   - On-demand warming for user sessions
   - Recently active user detection

## Key Features

### 1. Automatic Compression
- Values over 1KB are automatically compressed with gzip
- Transparent compression/decompression
- Reduces memory usage by up to 80% for text data

### 2. Tag-Based Invalidation
```typescript
// Cache with tags
await cacheService.set('user:123:profile', userData, {
  tags: ['user:123', 'profiles']
});

// Invalidate all user:123 tagged items
await cacheService.invalidateByTag('user:123');
```

### 3. Pattern-Based Invalidation
```typescript
// Invalidate all user conversations
await cacheService.invalidate('user-conversations:123:*');
```

### 4. Graceful Degradation
- App continues to work if Redis is unavailable
- Automatic reconnection with exponential backoff
- No thrown errors - returns null on cache miss

## Cache Configuration

### TTL Strategy
```typescript
const cacheConfig = {
  user: {
    profile: 3600,        // 1 hour
    sessions: 86400,      // 24 hours
  },
  conversation: {
    active: 300,          // 5 minutes
    completed: 86400,     // 24 hours
    list: 600,           // 10 minutes
  },
  openai: {
    transcription: 2592000, // 30 days
    analysis: Infinity,     // Forever
  }
};
```

### Route Caching Examples
```typescript
// Cache user profile for 5 minutes
router.get('/me', 
  requireAuth, 
  userCacheMiddleware({ ttl: 300 }), 
  getCurrentUser
);

// Invalidate cache on updates
router.post('/', 
  requireAuth,
  cacheInvalidateMiddleware(req => [
    `user-conversations:${req.userId}:*`
  ]),
  createConversation
);
```

## Performance Improvements

### Expected Benefits
- **Response Time**: 50-80% reduction for cached endpoints
- **Database Load**: 60-70% reduction in queries
- **OpenAI API Calls**: 30-40% reduction through response caching
- **Memory Usage**: Efficient with compression and TTL management

### Monitoring
- Real-time statistics via `cacheService.getStats()`
- Hit rate tracking (target: >80%)
- Memory usage monitoring
- Key distribution analysis

## Usage Examples

### Basic Operations
```typescript
// Simple get/set
await cacheService.set('key', value, { ttl: 300 });
const cached = await cacheService.get('key');

// Get or set pattern
const data = await cacheService.getOrSet(
  'expensive-query',
  async () => await performExpensiveQuery(),
  { ttl: 3600 }
);
```

### User Caching
```typescript
// Automatic user caching
const user = await userCacheService.getUser(userId);

// Invalidate on update
await userCacheService.updateUser(userId, { name: 'New Name' });
// Automatically clears all user-related caches
```

### OpenAI Response Caching
```typescript
// Cache transcription by audio hash
const audioHash = generateHash(audioBuffer);
const cached = await openAICacheService.getTranscription(audioHash);

if (!cached) {
  const transcription = await openai.transcribe(audio);
  await openAICacheService.cacheTranscription(audioHash, transcription);
}
```

## Testing

Comprehensive test coverage includes:
- Basic cache operations (get, set, delete)
- TTL expiration testing
- Compression verification
- Tag and pattern invalidation
- Error handling and degradation
- Middleware behavior
- Statistics tracking

Run tests:
```bash
cd check && bun test src/services/cache
cd check && bun test src/middleware/__tests__/cache.test.ts
```

## Deployment Considerations

1. **Redis Configuration**
   - Use Redis 6.0+ for better performance
   - Enable persistence for critical data
   - Configure maxmemory policy: `allkeys-lru`
   - Set up Redis Sentinel for HA

2. **Environment Variables**
   ```env
   REDIS_URL=redis://localhost:6379
   REDIS_POOL_SIZE=10
   REDIS_CONNECT_TIMEOUT=5000
   ```

3. **Monitoring**
   - Track cache hit rates
   - Monitor Redis memory usage
   - Alert on high eviction rates
   - Dashboard for real-time metrics

## Future Enhancements

1. **Redis Cluster Support**: For horizontal scaling
2. **Multi-tier Caching**: Add in-memory L1 cache
3. **Cache Preloading**: Predictive warming based on usage patterns
4. **GraphQL Integration**: Field-level caching
5. **CDN Integration**: Edge caching for static content