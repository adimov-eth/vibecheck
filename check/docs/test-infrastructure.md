# Test Infrastructure Documentation

## Overview
We've implemented a comprehensive test infrastructure using Bun's built-in test runner, providing unit tests, integration tests, and utilities for E2E testing.

## Test Structure

```
src/
├── __tests__/              # Unit tests next to source files
├── test/
│   ├── setup.ts            # Global test configuration
│   ├── factories/          # Test data factories
│   │   ├── user.factory.ts
│   │   ├── conversation.factory.ts
│   │   ├── audio.factory.ts
│   │   └── subscription.factory.ts
│   ├── mocks/              # Mock services
│   │   ├── openai.mock.ts
│   │   ├── notification.mock.ts
│   │   └── storage.mock.ts
│   ├── utils/              # Test utilities
│   │   ├── database.ts
│   │   └── auth.ts
│   └── fixtures/           # Test files and data
├── integration/            # Integration tests
├── e2e/                    # End-to-end tests
└── performance/            # Performance tests
```

## Key Components

### 1. Test Factories
Factories provide consistent test data generation using Faker.js:

```typescript
// Create a user with random data
const user = await UserFactory.create();

// Create with overrides
const premiumUser = await UserFactory.create({
  email: 'premium@example.com'
});

// Create multiple
const users = await UserFactory.createMany(5);

// Build without saving
const userData = UserFactory.build();
```

### 2. Mock Services
Comprehensive mocks for external dependencies:

**OpenAI Mock:**
```typescript
mockOpenAI.transcribeAudio.mockResolvedValue({
  text: 'Custom transcription'
});

// Simulate errors
mockOpenAI.simulateError('transcribe');
```

**Notification Mock:**
```typescript
// Track notification history
mockNotificationService.getHistory();

// Simulate failures
mockNotificationService.simulateFailure('push');
```

### 3. Test Database Management
Isolated test database with utilities:

```typescript
// Clean database between tests
await testDb.clean();

// Seed with test data
const { users, conversations } = await testDb.seed();

// Run in transaction (auto-rollback)
await testDb.withTransaction(async (tx) => {
  // Test operations
});
```

### 4. Authentication Utilities
Helpers for auth testing:

```typescript
// Create authenticated user
const { user, token } = await AuthTestUtils.createAuthenticatedUser();

// Create auth headers
const headers = AuthTestUtils.createAuthHeader(token);

// Create expired token
const expiredToken = AuthTestUtils.createExpiredToken(userId);
```

## Writing Tests

### Unit Tests
```typescript
import { describe, it, expect, beforeEach } from 'bun:test';

describe('UserService', () => {
  let userService: UserService;
  
  beforeEach(async () => {
    await testDb.clean();
    userService = new UserService();
  });
  
  it('should create user', async () => {
    const user = await userService.create({
      email: 'test@example.com'
    });
    
    expect(user.email).toBe('test@example.com');
  });
});
```

### Integration Tests
```typescript
describe('Conversation API', () => {
  let app: Express;
  let token: string;
  
  beforeAll(async () => {
    app = await createTestServer();
    const { token: authToken } = await AuthTestUtils.createAuthenticatedUser();
    token = authToken;
  });
  
  it('should create conversation', async () => {
    const response = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'therapy',
        recordingType: 'separate'
      });
      
    expect(response.status).toBe(201);
  });
});
```

### E2E Tests
```typescript
describe('E2E: Conversation Flow', () => {
  it('should complete full conversation flow', async () => {
    // 1. Create user and authenticate
    const { user, token } = await createE2EUser();
    
    // 2. Create conversation
    const conversation = await createConversation(token);
    
    // 3. Upload audio
    await uploadAudio(conversation.id, 'test-audio.mp3');
    
    // 4. Wait for processing
    await waitForProcessing(conversation.id);
    
    // 5. Verify results
    const result = await getConversation(conversation.id);
    expect(result.status).toBe('completed');
    expect(result.analysis).toBeTruthy();
  });
});
```

## Running Tests

### Commands
```bash
# Run all tests
bun test

# Run specific test file
bun test src/services/__tests__/user-service.test.ts

# Run tests matching pattern
bun test -t "should create user"

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Test Categories
```bash
# Unit tests only
bun test src/**/__tests__/*.test.ts

# Integration tests
bun test src/integration/*.test.ts

# E2E tests
bun test src/e2e/*.test.ts

# Performance tests
bun test src/performance/*.test.ts
```

## Best Practices

### 1. Test Isolation
- Always clean database before each test
- Reset mocks between tests
- Use transactions for data mutations

### 2. Test Data
- Use factories for consistent data
- Avoid hardcoded values
- Create minimal data needed for test

### 3. Assertions
- Test one thing per test
- Use descriptive test names
- Assert on behavior, not implementation

### 4. Performance
- Run database-heavy tests in parallel
- Use in-memory database for unit tests
- Mock external services

### 5. Debugging
```typescript
// Enable debug logging
process.env.DEBUG = 'true';

// Inspect test data
console.log(await testDb.getCounts());

// Check mock calls
console.log(mockOpenAI.transcribeAudio.mock.calls);
```

## Coverage Goals

Target coverage by component:
- **Services**: 90%+ (business logic)
- **Routes**: 85%+ (API endpoints)
- **Middleware**: 95%+ (critical path)
- **Utils**: 80%+ (helpers)
- **Overall**: 80%+

## CI/CD Integration

GitHub Actions workflow runs tests on:
- Push to main/develop
- Pull requests
- Scheduled (nightly full suite)

Tests must pass before:
- Merging PRs
- Deploying to staging
- Releasing to production

## Troubleshooting

### Common Issues

1. **Database Lock Errors**
   ```bash
   # Reset test database
   rm -f test.db test.db-wal test.db-shm
   ```

2. **Port Already in Use**
   ```typescript
   // Use random port
   const server = app.listen(0);
   ```

3. **Timeout Errors**
   ```typescript
   // Increase timeout for slow operations
   it('slow test', async () => {
     // test code
   }, { timeout: 10000 });
   ```

4. **Mock Not Working**
   ```typescript
   // Ensure mock is reset
   beforeEach(() => {
     mockService.reset();
   });
   ```