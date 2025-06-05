# TODO for Next Agent

## Current Status
I've completed comprehensive test infrastructure implementation including service tests and API route tests. The codebase now has robust testing capabilities using Bun's built-in test runner.

## Completed Work
1. ✅ Set up test framework with Bun test runner
2. ✅ Created test utilities and factories (UserFactory, ConversationFactory, etc.)
3. ✅ Created test database management with transaction support
4. ✅ Created mock services (OpenAI, Notification, Storage)
5. ✅ Created service layer tests (user-service, conversation-service)
6. ✅ Created API route tests for all major endpoints:
   - Conversation routes (`/api/conversations`)
   - User routes (`/api/user`)
   - Audio routes (`/api/audio`)
   - Subscription routes (`/api/subscription`)
   - Auth routes (existing tests enhanced)

## Next Priority Tasks

### 1. WebSocket Tests (High Priority)
**File to create**: `/check/src/utils/websocket/__tests__/websocket.test.ts`
- Test WebSocket connection establishment
- Test authentication via WebSocket
- Test real-time message delivery
- Test conversation status updates
- Test error handling and reconnection
- Test Redis pub/sub integration
- Mock WebSocket server for testing

### 2. E2E Tests (High Priority)
**File to create**: `/check/src/e2e/conversation-flow.test.ts`
- Complete conversation flow from creation to completion
- User registration and authentication flow
- Audio upload and processing pipeline
- Subscription verification flow
- Test with real services (use test/sandbox accounts)
- Verify push notifications delivery

### 3. Test Coverage Setup (Medium Priority)
- Configure Bun test coverage reporting
- Set up coverage thresholds (target: 80% overall)
- Create coverage report script in package.json
- Add coverage badges to README
- Exclude test files from coverage

### 4. CI/CD Integration (Medium Priority)
- Update GitHub Actions workflow to run tests
- Add test job to `.github/workflows/deploy-production.yml`
- Run tests on pull requests
- Fail deployment if tests don't pass
- Add test results as PR comments

## Additional Testing Tasks

### 5. Performance Tests
**File to create**: `/check/src/performance/load.test.ts`
- API endpoint load testing
- Database query performance
- WebSocket connection limits
- Memory usage under load
- Queue processing throughput

### 6. Security Tests
**File to create**: `/check/src/test/security/injection.test.ts`
- SQL injection prevention
- XSS prevention
- Rate limiting effectiveness
- JWT token security
- File upload security

### 7. Integration Tests
- Redis integration tests
- OpenAI API integration (with test API key)
- Apple Sign-In integration
- Push notification delivery

## Important Context

### Test Running Commands
```bash
# Run all tests
cd check && bun test

# Run specific test file
cd check && bun test src/utils/websocket/__tests__/websocket.test.ts

# Run with coverage
cd check && bun test --coverage

# Run tests matching pattern
cd check && bun test -t "WebSocket"
```

### Test Infrastructure Available
1. **TestDatabase**: Provides clean database for each test
2. **Factories**: UserFactory, ConversationFactory, AudioFactory, SubscriptionFactory
3. **Mocks**: mockOpenAI, mockNotificationService, mockStorageService
4. **Auth Utils**: createAuthenticatedUser(), createAuthToken()

### WebSocket Testing Approach
The WebSocket implementation is in `/check/src/utils/websocket/`. You'll need to:
1. Create a mock WebSocket server using `ws` package
2. Test the client connection logic
3. Mock Redis pub/sub for real-time updates
4. Test message handling and state management

### E2E Testing Approach
1. Use real HTTP requests via supertest
2. Use test database but real services where possible
3. Create helper functions for common flows
4. Use longer timeouts for async operations
5. Clean up test data after each test

## Files to Reference
- `/check/src/test/setup.ts` - Test setup configuration
- `/check/docs/test-infrastructure.md` - Testing documentation
- `/check/docs/api-route-testing.md` - API testing patterns
- `/check/src/api/routes/__tests__/*.test.ts` - Example API tests
- `/check/src/services/__tests__/*.test.ts` - Example service tests

## Success Criteria
- [ ] WebSocket tests cover connection, auth, and messaging
- [ ] E2E tests cover critical user journeys
- [ ] Test coverage > 80% for critical paths
- [ ] CI runs tests on every PR
- [ ] All tests pass consistently (no flaky tests)

## Notes
- The project uses Bun as the runtime and test runner
- Rate limiting is disabled in tests via `RATE_LIMITING_ENABLED=false`
- Database is SQLite in development, PostgreSQL in production
- WebSocket uses Redis for pub/sub in production

Good luck! The test infrastructure is solid - you just need to extend it to cover WebSockets and E2E flows.