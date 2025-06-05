# Detailed VibeCheck Improvement Plan

## Week 1-2: Critical Security & Stability Fixes

### Day 1-2: SQL Injection Prevention
```typescript
// 1. Create query builder utility
// check/src/utils/query-builder.ts
export class QueryBuilder {
  private query: string = '';
  private params: unknown[] = [];
  
  select(table: string, columns: string[] = ['*']): this {
    // Validate table name against whitelist
    const validTables = ['users', 'conversations', 'audios', 'subscriptions'];
    if (!validTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.query = `SELECT ${columns.join(', ')} FROM ${table}`;
    return this;
  }
  
  where(column: string, value: unknown): this {
    this.query += ` WHERE ${column} = ?`;
    this.params.push(value);
    return this;
  }
  
  build(): { sql: string; params: unknown[] } {
    return { sql: this.query, params: this.params };
  }
}

// 2. Update all database queries to use parameterized queries
// Example migration in audio-service.ts:
const qb = new QueryBuilder();
const { sql, params } = qb
  .select('audios')
  .where('conversationId', conversationId)
  .build();
const audios = await query<Audio>(sql, params);
```

### Day 3-4: Authentication Security
```typescript
// 1. Add rate limiting to auth endpoints
// check/src/middleware/auth-rate-limit.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

export const authRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'auth_fail',
  points: 5, // 5 attempts
  duration: 900, // per 15 minutes
  blockDuration: 900, // block for 15 minutes
});

export const authRateLimitMiddleware = async (req, res, next) => {
  try {
    const key = req.ip; // or use email for more specific limiting
    await authRateLimiter.consume(key);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Too many failed attempts',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60
    });
  }
};

// 2. Implement JWT rotation
// check/src/services/jwt-service.ts
export class JWTService {
  private keys: Map<string, { secret: string; expiresAt: Date }> = new Map();
  
  async rotateKeys(): Promise<void> {
    const newKeyId = crypto.randomUUID();
    const newSecret = crypto.randomBytes(64).toString('hex');
    
    this.keys.set(newKeyId, {
      secret: newSecret,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    // Store in Redis for distributed systems
    await redisClient.set(`jwt:key:${newKeyId}`, newSecret, {
      EX: 30 * 24 * 60 * 60 // 30 days
    });
    
    // Clean up old keys
    for (const [keyId, keyData] of this.keys) {
      if (keyData.expiresAt < new Date()) {
        this.keys.delete(keyId);
        await redisClient.del(`jwt:key:${keyId}`);
      }
    }
  }
  
  async signToken(payload: any): Promise<string> {
    const keyId = Array.from(this.keys.keys()).pop(); // Get latest key
    const keyData = this.keys.get(keyId);
    
    return jwt.sign(payload, keyData.secret, {
      header: { kid: keyId },
      expiresIn: '7d'
    });
  }
}
```

### Day 5-6: Memory Leak Fixes
```typescript
// 1. Fix audio processing memory leaks
// check/src/services/audio-service.ts
import { pipeline } from 'stream/promises';

export const processAudioStream = async (
  inputStream: ReadableStream,
  outputPath: string
): Promise<void> => {
  const writeStream = createWriteStream(outputPath);
  
  try {
    await pipeline(inputStream, writeStream);
  } finally {
    // Ensure streams are closed
    if (!inputStream.closed) inputStream.close();
    if (!writeStream.closed) writeStream.close();
  }
};

// 2. Fix WebSocket memory leaks
// vibe/hooks/useWebSocket.ts
export const useWebSocket = () => {
  const { socket, connectWebSocket, disconnectWebSocket } = useStore();
  
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let isCleaningUp = false;
    
    const connect = async () => {
      if (isCleaningUp) return;
      
      try {
        await connectWebSocket();
      } catch (error) {
        console.error('WebSocket connection failed:', error);
        // Exponential backoff
        reconnectTimeout = setTimeout(() => {
          if (!isCleaningUp) connect();
        }, Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
      }
    };
    
    connect();
    
    return () => {
      isCleaningUp = true;
      clearTimeout(reconnectTimeout);
      disconnectWebSocket();
    };
  }, []);
  
  return { socket };
};
```

### Day 7-8: Critical Tests
```typescript
// 1. Auth service tests
// check/src/services/__tests__/auth-service.test.ts
describe('AuthService', () => {
  describe('authenticateWithApple', () => {
    it('should create new user on first login', async () => {
      const mockToken = 'valid-token';
      jest.spyOn(appleAuth, 'verifyAppleToken').mockResolvedValue({
        success: true,
        data: { userId: 'apple123', email: 'test@example.com' }
      });
      
      const result = await authenticateWithApple(mockToken);
      
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('apple:apple123');
      expect(result.data.email).toBe('test@example.com');
    });
    
    it('should handle duplicate email error', async () => {
      // Create existing user
      await createUser({ id: 'existing', email: 'test@example.com' });
      
      const result = await authenticateWithApple('token');
      
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('already associated');
    });
  });
});

// 2. Conversation API tests
// check/src/api/routes/__tests__/conversation.test.ts
describe('POST /conversations', () => {
  it('should create conversation with auth', async () => {
    const token = await createTestUserAndToken();
    
    const response = await request(app)
      .post('/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'therapy', recordingType: 'separate' });
      
    expect(response.status).toBe(201);
    expect(response.body.conversation).toHaveProperty('id');
    expect(response.body.conversation.mode).toBe('therapy');
  });
  
  it('should return 401 without auth', async () => {
    const response = await request(app)
      .post('/conversations')
      .send({ mode: 'therapy' });
      
    expect(response.status).toBe(401);
  });
});
```

## Week 3-4: Database Migration & Performance

### Day 1-3: PostgreSQL Migration
```typescript
// 1. Create PostgreSQL schema
// check/migrations/001_initial_schema.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(50) NOT NULL,
  recording_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

// 2. Update database module for PostgreSQL
// check/src/database/postgres.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
};

export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

### Day 4-5: Implement Caching
```typescript
// 1. Create caching service
// check/src/services/cache-service.ts
export class CacheService {
  private defaultTTL = 3600; // 1 hour
  
  async get<T>(key: string): Promise<T | null> {
    const cached = await redisClient.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  async set(key: string, value: any, ttl = this.defaultTTL): Promise<void> {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  }
  
  async invalidate(pattern: string): Promise<void> {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
  
  // Decorator for automatic caching
  cache(keyPrefix: string, ttl?: number) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function(...args: any[]) {
        const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
        
        // Try cache first
        const cached = await this.get(cacheKey);
        if (cached) return cached;
        
        // Call original method
        const result = await originalMethod.apply(this, args);
        
        // Cache result
        await this.set(cacheKey, result, ttl);
        
        return result;
      };
    };
  }
}

// 2. Apply caching to services
// check/src/services/user-service.ts
class UserService {
  @cache('user', 3600)
  async getUser(id: string): Promise<User | null> {
    return await queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  }
  
  async updateUser(id: string, data: Partial<User>): Promise<void> {
    await run('UPDATE users SET ... WHERE id = $1', [...]);
    // Invalidate cache
    await cacheService.invalidate(`user:*${id}*`);
  }
}
```

### Day 6-8: Query Optimization
```typescript
// 1. Fix N+1 queries with DataLoader
// check/src/loaders/conversation-loader.ts
import DataLoader from 'dataloader';

export const createConversationLoader = () => {
  return new DataLoader<string, Conversation>(async (ids) => {
    const conversations = await query<Conversation>(
      'SELECT * FROM conversations WHERE id = ANY($1)',
      [ids]
    );
    
    // Map results back to original order
    const conversationMap = new Map(
      conversations.map(c => [c.id, c])
    );
    
    return ids.map(id => conversationMap.get(id) || null);
  });
};

// 2. Add database views for complex queries
// check/migrations/002_add_views.sql
CREATE MATERIALIZED VIEW user_stats AS
SELECT 
  u.id as user_id,
  COUNT(DISTINCT c.id) as total_conversations,
  COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as completed_conversations,
  COUNT(DISTINCT DATE(c.created_at)) as active_days,
  MAX(c.created_at) as last_conversation_at
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
GROUP BY u.id;

CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);

-- Refresh periodically
CREATE OR REPLACE FUNCTION refresh_user_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
END;
$$ LANGUAGE plpgsql;
```

## Week 5-6: Testing Infrastructure

### Day 1-3: Backend Test Suite
```typescript
// 1. Test setup and utilities
// check/src/test/setup.ts
import { Pool } from 'pg';

let testPool: Pool;

beforeAll(async () => {
  // Create test database
  testPool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL
  });
  
  // Run migrations
  await runMigrations(testPool);
});

afterEach(async () => {
  // Clean up test data
  await testPool.query('TRUNCATE TABLE users, conversations, audios CASCADE');
});

afterAll(async () => {
  await testPool.end();
});

// 2. Service integration tests
// check/src/services/__tests__/conversation-service.integration.test.ts
describe('ConversationService Integration', () => {
  it('should handle full conversation lifecycle', async () => {
    // Create user
    const user = await createTestUser();
    
    // Create conversation
    const conversation = await conversationService.create({
      userId: user.id,
      mode: 'therapy',
      recordingType: 'separate'
    });
    
    expect(conversation.status).toBe('waiting');
    
    // Add audio
    const audio = await audioService.createAudioRecord({
      conversationId: conversation.id,
      userId: user.id,
      audioFile: 'test.mp3',
      audioKey: 'test-key'
    });
    
    // Process audio (mock)
    await audioQueue.add('transcribe', { audioId: audio.id });
    
    // Wait for processing
    await waitFor(async () => {
      const updated = await conversationService.getById(conversation.id);
      expect(updated.status).toBe('transcribing');
    });
  });
});
```

### Day 4-5: Frontend Testing
```typescript
// 1. Component tests
// vibe/components/__tests__/RecordButton.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RecordButton } from '../recording/RecordButton';

describe('RecordButton', () => {
  it('should start recording on press', async () => {
    const onStart = jest.fn();
    const { getByTestId } = render(
      <RecordButton onStart={onStart} />
    );
    
    fireEvent.press(getByTestId('record-button'));
    
    await waitFor(() => {
      expect(onStart).toHaveBeenCalled();
    });
  });
  
  it('should show recording indicator when active', () => {
    const { getByTestId, rerender } = render(
      <RecordButton isRecording={false} />
    );
    
    expect(getByTestId('record-indicator')).toHaveStyle({ opacity: 0 });
    
    rerender(<RecordButton isRecording={true} />);
    
    expect(getByTestId('record-indicator')).toHaveStyle({ opacity: 1 });
  });
});

// 2. Hook tests
// vibe/hooks/__tests__/useConversation.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useConversation } from '../useConversation';

describe('useConversation', () => {
  it('should create and fetch conversation', async () => {
    const { result } = renderHook(() => useConversation());
    
    let conversationId: string;
    
    await act(async () => {
      conversationId = await result.current.createConversation(
        'therapy',
        'separate'
      );
    });
    
    expect(conversationId).toBeTruthy();
    expect(result.current.conversation?.id).toBe(conversationId);
  });
});
```

### Day 6-8: E2E Tests
```typescript
// 1. API E2E tests
// check/e2e/conversation-flow.e2e.ts
describe('Conversation Flow E2E', () => {
  let authToken: string;
  let conversationId: string;
  
  beforeAll(async () => {
    // Register user
    const registerRes = await request(app)
      .post('/auth/apple')
      .send({ identityToken: 'mock-token' });
      
    authToken = registerRes.body.token;
  });
  
  it('should complete full conversation flow', async () => {
    // 1. Create conversation
    const createRes = await request(app)
      .post('/conversations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'therapy', recordingType: 'separate' });
      
    conversationId = createRes.body.conversation.id;
    
    // 2. Upload audio
    const audioRes = await request(app)
      .post(`/conversations/${conversationId}/audio`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('audio', 'test/fixtures/sample.mp3');
      
    expect(audioRes.status).toBe(200);
    
    // 3. Check processing status via WebSocket
    const ws = new WebSocket(`ws://localhost:3001/ws`);
    
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'conversation.completed') {
          expect(message.conversationId).toBe(conversationId);
          resolve(true);
        }
      });
    });
    
    // 4. Get results
    const resultsRes = await request(app)
      .get(`/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(resultsRes.body.conversation.analysis).toBeTruthy();
  });
});
```

## Week 7-8: Monitoring & Observability

### Day 1-3: Structured Logging
```typescript
// 1. Implement correlation IDs
// check/src/middleware/correlation-id.ts
export const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  
  // Attach to async local storage for access in services
  asyncLocalStorage.run({ correlationId: req.correlationId }, next);
};

// 2. Enhanced logger
// check/src/utils/logger.ts
import { asyncLocalStorage } from './async-context';

class StructuredLogger {
  private baseLogger: winston.Logger;
  
  constructor() {
    this.baseLogger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'vibecheck-api' },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
      ]
    });
  }
  
  private getContext() {
    const store = asyncLocalStorage.getStore();
    return {
      correlationId: store?.correlationId,
      userId: store?.userId,
      ...store?.additionalContext
    };
  }
  
  info(message: string, meta?: any) {
    this.baseLogger.info(message, { ...this.getContext(), ...meta });
  }
  
  error(message: string, error?: Error, meta?: any) {
    this.baseLogger.error(message, {
      ...this.getContext(),
      error: error ? {
        message: error.message,
        stack: error.stack,
        ...error
      } : undefined,
      ...meta
    });
  }
}
```

### Day 4-5: Metrics & APM
```typescript
// 1. Prometheus metrics
// check/src/monitoring/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

export const activeWebSocketConnections = new Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections'
});

export const jobProcessed = new Counter({
  name: 'jobs_processed_total',
  help: 'Total number of jobs processed',
  labelNames: ['queue', 'status']
});

// 2. Metrics middleware
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || 'unknown', res.statusCode)
      .observe(duration);
  });
  
  next();
};

// 3. Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Day 6-8: Alerts & Dashboards
```yaml
# 1. Prometheus alerts
# monitoring/alerts.yml
groups:
  - name: vibecheck
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: "Error rate is {{ $value }} errors per second"
      
      - alert: SlowAPIResponse
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: API response time is slow
          
      - alert: JobQueueBacklog
        expr: bull_queue_waiting_jobs > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Job queue backlog is growing

# 2. Grafana dashboard config
# monitoring/dashboards/api-dashboard.json
{
  "dashboard": {
    "title": "VibeCheck API Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "rate(http_requests_total[5m])"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(http_requests_total{status_code=~'5..'}[5m])"
        }]
      },
      {
        "title": "Response Time (p95)",
        "targets": [{
          "expr": "histogram_quantile(0.95, http_request_duration_seconds)"
        }]
      }
    ]
  }
}
```

## Week 9-10: API Standardization & State Management

### Day 1-3: API Response Standardization
```typescript
// 1. Standard response types
// check/src/types/api.ts
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// 2. Response helper
// check/src/utils/api-response.ts
export class ApiResponseBuilder {
  static success<T>(data: T, meta?: any): ApiResponse<T> {
    return {
      success: true,
      data,
      meta
    };
  }
  
  static error(code: string, message: string, details?: any): ApiResponse {
    return {
      success: false,
      error: { code, message, details }
    };
  }
  
  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): ApiResponse<T[]> {
    return {
      success: true,
      data,
      meta: { page, limit, total }
    };
  }
}

// 3. Update all endpoints
// check/src/api/routes/conversation.ts
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const conversation = await conversationService.create({
      userId: req.userId,
      ...req.body
    });
    
    res.json(ApiResponseBuilder.success({ conversation }));
  } catch (error) {
    next(error);
  }
});
```

### Day 4-5: OpenAPI Documentation
```yaml
# check/openapi.yml
openapi: 3.0.0
info:
  title: VibeCheck API
  version: 1.0.0
  description: Conversation intelligence platform API

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      
  schemas:
    ApiResponse:
      type: object
      properties:
        success:
          type: boolean
        data:
          type: object
        error:
          $ref: '#/components/schemas/ApiError'
          
    Conversation:
      type: object
      properties:
        id:
          type: string
          format: uuid
        userId:
          type: string
        mode:
          type: string
          enum: [therapy, coaching, interview]
        status:
          type: string
          enum: [waiting, processing, completed, failed]

paths:
  /conversations:
    post:
      summary: Create a new conversation
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                mode:
                  type: string
                recordingType:
                  type: string
      responses:
        '201':
          description: Conversation created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponse'
```

### Day 6-8: Frontend State Refactoring
```typescript
// 1. Split Zustand store into features
// vibe/state/stores/auth.store.ts
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        token: null,
        isAuthenticated: false,
        
        login: (token, user) => {
          set({ token, user, isAuthenticated: true });
        },
        
        logout: () => {
          set({ token: null, user: null, isAuthenticated: false });
        },
        
        refreshToken: async () => {
          const { token } = get();
          if (!token) return;
          
          try {
            const response = await api.post('/auth/refresh', { token });
            set({ token: response.data.token });
          } catch (error) {
            get().logout();
          }
        }
      }),
      {
        name: 'auth-storage',
        partialize: (state) => ({ token: state.token, user: state.user })
      }
    )
  )
);

// 2. Add React Query for server state
// vibe/hooks/queries/useConversationsQuery.ts
export const useConversationsQuery = () => {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useConversationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateConversationDto) => 
      api.post('/conversations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
};
```

## Week 11-12: Production Optimization

### Day 1-3: Performance Optimization
```typescript
// 1. Implement request batching
// check/src/middleware/batch-requests.ts
export const batchMiddleware = () => {
  const batchQueue = new Map<string, Promise<any>>();
  
  return async (req, res, next) => {
    if (req.method !== 'POST' || !req.body.batch) {
      return next();
    }
    
    const results = await Promise.all(
      req.body.batch.map(async (request) => {
        const key = `${request.method}:${request.url}`;
        
        // Check if same request is already in flight
        if (batchQueue.has(key)) {
          return batchQueue.get(key);
        }
        
        const promise = processRequest(request);
        batchQueue.set(key, promise);
        
        try {
          return await promise;
        } finally {
          batchQueue.delete(key);
        }
      })
    );
    
    res.json({ batch: results });
  };
};

// 2. Add response compression
// check/src/index.ts
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6
}));
```

### Day 4-5: Bundle Optimization
```typescript
// 1. Implement code splitting
// vibe/app/(main)/_layout.tsx
import { lazy, Suspense } from 'react';

const Profile = lazy(() => import('./profile'));
const Recording = lazy(() => import('./recording'));
const Results = lazy(() => import('./results'));

export default function MainLayout() {
  return (
    <Tabs>
      <Suspense fallback={<LoadingScreen />}>
        <Tabs.Screen
          name="profile"
          component={Profile}
          options={{ lazy: true }}
        />
        <Tabs.Screen
          name="recording"
          component={Recording}
          options={{ lazy: true }}
        />
      </Suspense>
    </Tabs>
  );
}

// 2. Optimize imports
// vibe/babel.config.js
module.exports = {
  plugins: [
    ['import', {
      libraryName: 'lodash',
      libraryDirectory: '',
      camel2DashComponentName: false
    }],
    ['transform-imports', {
      '@react-native-async-storage/async-storage': {
        transform: '@react-native-async-storage/async-storage/lib/commonjs/${member}',
        preventFullImport: true
      }
    }]
  ]
};
```

### Day 6-8: Load Testing & Final Optimization
```typescript
// 1. Load test script
// load-tests/conversation-flow.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up more
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
  },
};

export default function() {
  // 1. Authenticate
  const authRes = http.post(`${BASE_URL}/auth/apple`, {
    identityToken: 'test-token'
  });
  
  check(authRes, {
    'auth successful': (r) => r.status === 200,
  });
  
  const token = authRes.json('token');
  const headers = { Authorization: `Bearer ${token}` };
  
  // 2. Create conversation
  const convRes = http.post(
    `${BASE_URL}/conversations`,
    JSON.stringify({ mode: 'therapy', recordingType: 'separate' }),
    { headers }
  );
  
  check(convRes, {
    'conversation created': (r) => r.status === 201,
  });
  
  sleep(1);
}

// 2. Database optimization based on load test results
// check/src/database/optimizations.ts
export const optimizeQueries = async () => {
  // Add missing indexes found during load testing
  await run(`
    CREATE INDEX CONCURRENTLY idx_audios_created_at 
    ON audios(created_at DESC) 
    WHERE status = 'completed';
  `);
  
  // Partition large tables
  await run(`
    -- Partition conversations by month
    CREATE TABLE conversations_2024_01 PARTITION OF conversations
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
  `);
  
  // Add query hints for complex queries
  await run(`
    -- Force index usage for user stats
    CREATE OR REPLACE FUNCTION get_user_stats(user_id VARCHAR)
    RETURNS TABLE(...) AS $$
    BEGIN
      RETURN QUERY
      SELECT /*+ IndexScan(conversations idx_conversations_user_id) */ 
        ...
      FROM conversations
      WHERE user_id = $1;
    END;
    $$ LANGUAGE plpgsql;
  `);
};
```

## Implementation Checklist

### Immediate Actions (This Week)
- [ ] Fix SQL injection vulnerabilities
- [ ] Add auth rate limiting
- [ ] Fix memory leaks in audio processing
- [ ] Add WebSocket reconnection logic
- [ ] Create basic test suite for auth

### Short-term (Next 2 Weeks)
- [ ] Migrate to PostgreSQL
- [ ] Implement Redis caching
- [ ] Add correlation IDs
- [ ] Set up Prometheus metrics
- [ ] Standardize API responses

### Medium-term (Next Month)
- [ ] Achieve 80% test coverage
- [ ] Implement OpenAPI documentation
- [ ] Refactor frontend state management
- [ ] Add E2E test suite
- [ ] Set up monitoring dashboards

### Long-term (Next Quarter)
- [ ] Implement microservices architecture
- [ ] Add multi-region support
- [ ] Implement A/B testing framework
- [ ] Add advanced analytics
- [ ] Scale to 10k concurrent users

## Success Metrics

1. **Security**: 0 critical vulnerabilities in security scan
2. **Performance**: p95 response time < 500ms
3. **Reliability**: 99.9% uptime
4. **Quality**: 80%+ test coverage
5. **Scale**: Support 10k concurrent users
6. **Developer Experience**: < 30min to onboard new developer

This plan provides concrete, actionable steps with code examples that can be implemented immediately. Each phase builds on the previous one, ensuring a smooth transition from the current state to a production-ready system.