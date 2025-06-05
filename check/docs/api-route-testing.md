# API Route Testing Documentation

## Overview
We've implemented comprehensive API route tests for all major endpoints in the VibeCheck backend. These tests ensure our API behaves correctly under various conditions including success cases, error handling, authentication, and rate limiting.

## Test Coverage

### Routes Tested
1. **Conversation Routes** (`/api/conversations`)
   - Create conversation
   - Get conversation by ID
   - List user conversations
   - Process conversation

2. **User Routes** (`/api/user`)
   - Get current user (`/me`)
   - Apple authentication
   - Get usage statistics

3. **Audio Routes** (`/api/audio`)
   - Upload audio file
   - Get audio by ID
   - Get conversation audios
   - Update audio status

4. **Subscription Routes** (`/api/subscription`)
   - Get subscription status
   - Verify subscription receipt
   - Handle App Store notifications

5. **Auth Routes** (`/api/auth`)
   - CAPTCHA generation and verification
   - Account unlock flow
   - Rate limit statistics

## Running API Route Tests

### Run All API Route Tests
```bash
cd check
bun test src/api/routes/__tests__
```

### Run Specific Route Tests
```bash
# Conversation routes
bun test src/api/routes/__tests__/conversation.test.ts

# User routes
bun test src/api/routes/__tests__/user.test.ts

# Audio routes
bun test src/api/routes/__tests__/audio.test.ts

# Subscription routes
bun test src/api/routes/__tests__/subscription.test.ts

# Auth routes (existing)
bun test src/api/routes/__tests__/auth.integration.test.ts
```

### Run Specific Test Cases
```bash
# Run tests matching a pattern
bun test -t "should create a new conversation"

# Run tests for a specific describe block
bun test -t "POST /api/conversations"
```

## Test Structure

### Common Test Setup
Each test file follows this pattern:

```typescript
describe('Route Name API Routes', () => {
  let app: Application;
  let testDb: TestDatabase;
  let testUser: User;
  let authToken: string;
  
  beforeAll(async () => {
    // Initialize test database and app
  });
  
  beforeEach(async () => {
    // Clean database
    // Create authenticated user
    // Reset mocks
  });
  
  describe('HTTP METHOD /path', () => {
    it('should handle success case', async () => {
      // Test implementation
    });
    
    it('should validate input', async () => {
      // Test validation
    });
    
    it('should require authentication', async () => {
      // Test auth requirement
    });
  });
});
```

## Key Testing Patterns

### 1. Authentication Testing
```typescript
it('should require authentication', async () => {
  const response = await request(app)
    .get('/api/endpoint')
    // No auth header
    
  expect(response.status).toBe(401);
});
```

### 2. Input Validation
```typescript
it('should validate required fields', async () => {
  const response = await request(app)
    .post('/api/endpoint')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      // Missing required fields
    });
    
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('required');
});
```

### 3. Authorization/Ownership
```typescript
it('should enforce resource ownership', async () => {
  const otherUser = await UserFactory.create();
  const otherResource = await ResourceFactory.create({
    userId: otherUser.id
  });
  
  const response = await request(app)
    .get(`/api/resource/${otherResource.id}`)
    .set('Authorization', `Bearer ${authToken}`);
    
  expect(response.status).toBe(403);
});
```

### 4. Rate Limiting
```typescript
it('should rate limit requests', async () => {
  const requests = Array(10).fill(null).map(() => 
    request(app)
      .post('/api/endpoint')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validData)
  );
  
  const responses = await Promise.all(requests);
  const rateLimited = responses.filter(r => r.status === 429);
  
  expect(rateLimited.length).toBeGreaterThan(0);
});
```

### 5. File Upload Testing
```typescript
it('should upload file successfully', async () => {
  const buffer = Buffer.from('test-data');
  
  const response = await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${authToken}`)
    .field('metadata', 'value')
    .attach('file', buffer, 'filename.ext');
    
  expect(response.status).toBe(201);
});
```

## Mocking External Dependencies

### Mocked Services
- **OpenAI API**: Simulates transcription and analysis
- **Notification Service**: Tracks sent notifications
- **Storage Service**: In-memory file storage
- **Queue System**: Captures job creation
- **Apple Auth**: Simulates token verification

### Example Mock Usage
```typescript
// Reset mocks between tests
beforeEach(() => {
  mockOpenAI.reset();
  mockNotificationService.reset();
});

// Configure mock behavior
mockOpenAI.simulateError('transcribe');
mockNotificationService.simulateFailure('push');

// Verify mock calls
expect(mockOpenAI.transcribeAudio).toHaveBeenCalledWith(
  expect.stringContaining('audio')
);
```

## Best Practices

### 1. Test Isolation
- Clean database before each test
- Reset all mocks
- Create fresh test data

### 2. Realistic Test Data
- Use factories for consistent data
- Test edge cases (empty strings, nulls)
- Test boundary conditions

### 3. Error Scenarios
- Test validation errors
- Test authorization failures
- Test external service failures
- Test database errors

### 4. Response Validation
- Check status codes
- Validate response structure
- Verify side effects (database changes)
- Check error messages

### 5. Performance Considerations
- Use database transactions for faster cleanup
- Run independent tests in parallel
- Mock expensive operations

## Common Issues and Solutions

### Port Already in Use
```typescript
// Let the system assign a random port
const server = app.listen(0);
const port = server.address().port;
```

### Database Lock Errors
```bash
# Clean test database
rm -f test.db test.db-wal test.db-shm
```

### Flaky Tests
- Add retry logic for timing-sensitive tests
- Use proper async/await
- Increase timeouts for slow operations

### Mock Not Working
- Ensure mock module paths match exactly
- Reset mocks in beforeEach
- Check mock implementation

## Coverage Goals

Target coverage for API routes:
- **Route Handlers**: 90%+
- **Validation Logic**: 95%+
- **Error Paths**: 85%+
- **Authentication**: 100%

## CI/CD Integration

API route tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-deployment checks

Tests must pass before:
- Merging PRs
- Deploying to staging
- Releasing to production