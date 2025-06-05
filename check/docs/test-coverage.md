# Test Coverage Documentation

## Overview
This project uses Bun's built-in test coverage features to track code coverage.

## Running Coverage

### Basic Coverage
```bash
# Run all tests with coverage
bun test:coverage

# Run specific test file with coverage
bun test src/test/jwt-debug.test.ts --coverage
```

### Coverage Reports
```bash
# Generate text and LCOV reports
bun test:coverage:report

# Generate HTML coverage report (requires nyc)
bun test:coverage:html
```

## Coverage Files
- `coverage/lcov.info` - LCOV format for CI/CD integration
- `coverage/index.html` - HTML report (when using nyc)

## Current Coverage Status
Based on JWT test run:
- **Overall Coverage**: ~49%
- **Key Areas**:
  - `src/config.ts`: 94.55%
  - `src/types/common.ts`: 100%
  - `src/utils/logger.ts`: 83.33%
  - `src/services/session-service.ts`: 45.91%
  - `src/services/jwt-key-service.ts`: 12.39%

## Coverage Goals
1. **Target**: 80% line coverage for critical paths
2. **Priority Areas**:
   - Authentication services
   - API route handlers
   - Core business logic
   - Error handling

## Integration with CI/CD

### GitHub Actions
Add to `.github/workflows/test.yml`:
```yaml
- name: Run tests with coverage
  run: bun test:coverage:report
  
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
    flags: unittests
    fail_ci_if_error: true
```

### Coverage Badge
Add to README.md:
```markdown
[![Coverage Status](https://codecov.io/gh/YOUR_REPO/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_REPO)
```

## Improving Coverage

### Quick Wins
1. Add tests for utility functions
2. Test error handling paths
3. Add integration tests for API routes
4. Test edge cases in services

### Test Organization
- Unit tests: `src/**/__tests__/*.test.ts`
- Integration tests: `src/**/__tests__/*.integration.test.ts`
- E2E tests: `src/e2e/*.test.ts`
- Security tests: `src/test/security/*.test.ts`

## Excluding Files
To exclude files from coverage, use:
```bash
# In test files
/* c8 ignore start */
// Code to ignore
/* c8 ignore stop */
```

## Best Practices
1. Run coverage before commits
2. Don't merge PRs that decrease coverage
3. Focus on testing business logic, not implementation details
4. Write tests for bug fixes to prevent regression