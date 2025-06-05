# E2E Testing Documentation

## Overview
End-to-End (E2E) tests verify complete user journeys through the application, testing the integration of all components including API endpoints, database, authentication, and background processing.

## Test Structure

### Test Files
- `/src/e2e/conversation-flow.test.ts` - Complete conversation journey
- `/src/e2e/auth-flow.test.ts` - User registration and authentication
- `/src/e2e/audio-processing.test.ts` - Audio upload and processing pipeline
- `/src/e2e/subscription-flow.test.ts` - Subscription purchase and management

### Test Organization
Each E2E test file follows this structure:
1. **Setup**: Initialize test server and database
2. **Test Scenarios**: Complete user journeys
3. **Teardown**: Clean up resources

## Running E2E Tests

```bash
# Run all E2E tests
bun test src/e2e

# Run specific E2E test file
bun test src/e2e/conversation-flow.test.ts

# Run with longer timeout for complex flows
bun test src/e2e --timeout 30000
```

## Test Scenarios Covered

### 1. Conversation Flow (`conversation-flow.test.ts`)
- **Complete Journey**: Create conversation → Upload audio → Check status → Get results
- **Multiple Uploads**: Handle multiple audio files per conversation
- **Rate Limiting**: Enforce conversation creation limits
- **Error Handling**: Invalid IDs, unauthorized access, file size limits
- **Subscription Validation**: Check subscription requirements

### 2. Authentication Flow (`auth-flow.test.ts`)
- **User Registration**: New user signup with Apple Sign In
- **Existing User Login**: Return user authentication
- **Token Management**: Access token refresh flow
- **Account Security**: Account lockout after failed attempts
- **Rate Limiting**: Authentication attempt limits
- **Session Management**: Session persistence and logout

### 3. Audio Processing (`audio-processing.test.ts`)
- **File Upload**: Audio file upload validation
- **Format Validation**: Ensure only audio files accepted
- **Size Limits**: Enforce 10MB file size limit
- **Processing Pipeline**: Upload → Transcription → Analysis
- **Error Handling**: Processing failure recovery
- **Batch Processing**: Multiple audio files per conversation

### 4. Subscription Flow (`subscription-flow.test.ts`)
- **Purchase Flow**: New subscription validation
- **Renewal**: Subscription renewal handling
- **Expiration**: Expired subscription behavior
- **Usage Limits**: Free vs premium user limits
- **Webhooks**: Apple S2S notification handling
- **Grace Period**: Billing retry period support

## Key Testing Patterns

### 1. Test Isolation
Each test:
- Starts with a clean database
- Creates its own test data
- Runs on a separate port
- Cleans up after completion

### 2. Mock Strategy
- **External Services**: OpenAI, Apple Auth mocked
- **File Storage**: In-memory storage for tests
- **Background Jobs**: Simulated inline for deterministic tests

### 3. Authentication
All protected endpoints tested with:
- Valid tokens
- Expired tokens
- Invalid tokens
- Missing tokens

### 4. Error Scenarios
Each flow tests:
- Happy path
- Validation errors
- Authorization errors
- Rate limiting
- Server errors

## Best Practices

### 1. Test Data
```typescript
// Use factories for consistent test data
const user = await UserFactory.create({
  email: 'test@example.com'
})

// Create related data
const conversation = await ConversationFactory.create({
  userId: user.id
})
```

### 2. API Calls
```typescript
// Always include proper headers
const response = await fetch(`${API_URL}/endpoint`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
})

// Check both status and response data
expect(response.status).toBe(200)
const result = await response.json()
expect(result.field).toBeDefined()
```

### 3. Async Operations
```typescript
// Wait for async operations to complete
await new Promise(resolve => setTimeout(resolve, 100))

// Or use promises for events
const result = await new Promise((resolve) => {
  client.on('message', resolve)
})
```

## Debugging E2E Tests

### 1. Verbose Logging
```bash
# Enable debug logging
DEBUG=* bun test src/e2e/auth-flow.test.ts
```

### 2. Run Single Test
```typescript
it.only('should handle specific scenario', async () => {
  // Focused test
})
```

### 3. Inspect Database State
```typescript
// Add debug queries
const records = await db.select().from('table').all()
console.log('Database state:', records)
```

## CI/CD Integration

### GitHub Actions Configuration
```yaml
- name: Run E2E Tests
  run: |
    # Start services
    docker-compose up -d redis postgres
    
    # Run migrations
    bun run db:migrate
    
    # Run E2E tests
    bun test src/e2e
```

## Performance Considerations

1. **Parallel Execution**: Tests use different ports to run in parallel
2. **Database**: In-memory SQLite for speed
3. **Mocks**: External services mocked to avoid network calls
4. **Cleanup**: Proper cleanup prevents test interference

## Future Improvements

1. **WebSocket E2E**: Full WebSocket integration tests
2. **Load Testing**: Performance testing under load
3. **Visual Regression**: Screenshot comparison for frontend
4. **Cross-Platform**: Test on different environments
5. **Monitoring**: Test execution metrics and reporting