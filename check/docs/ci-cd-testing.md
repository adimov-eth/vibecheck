# CI/CD Testing Integration

## Overview
The CI/CD pipeline now includes comprehensive testing at multiple stages to ensure code quality and prevent regressions.

## GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)
Runs on all branches and pull requests.

**Test Stages:**
- Unit tests
- Security tests  
- Integration tests (non-blocking)
- Coverage reporting with Codecov upload

### 2. Test Suite Workflow (`test.yml`)
Dedicated test workflow with matrix strategy.

**Features:**
- Multiple Node.js versions (18, 20)
- Test type selection (unit, integration, e2e, security)
- Coverage artifact uploads
- Test summary reports

### 3. PR Checks Workflow (`pr-checks.yml`)
Runs on pull requests only.

**Checks:**
- PR size analysis
- Commit message conventions
- Code quality (lint + typecheck)
- Critical tests (auth + security)
- Coverage threshold warnings

### 4. Production Deployment (`deploy-production.yml`)
Tests must pass before deployment.

**Flow:**
1. Calls CI workflow
2. Only deploys if tests pass
3. Verifies deployment health

## Test Commands

### Running Tests Locally
```bash
# All tests
bun test

# Specific test types
bun run test:unit
bun run test:integration
bun run test:security
bun run test:auth

# With coverage
bun run test:coverage
bun run test:coverage:report
```

### Coverage Reports
- Text output in terminal
- LCOV file at `coverage/lcov.info`
- HTML report with `bun run test:coverage:html`
- Automated upload to Codecov in CI

## Test Organization

```
check/
├── src/
│   ├── **/__tests__/        # Unit tests
│   ├── e2e/                 # End-to-end tests
│   └── test/
│       ├── security/        # Security tests
│       └── integration/     # Integration tests
└── coverage/                # Coverage reports
```

## CI Configuration

### Required Secrets
- `OPENAI_API_KEY` - For API quota checks
- `DEPLOY_KEY` - For production deployment
- `DEPLOY_HOST` - Production server host
- `DEPLOY_USER` - Production server user
- `DEPLOY_PATH` - Production deployment path

### Branch Protection Rules
Recommended settings for `main` branch:
- Require PR before merging
- Require status checks: `backend-ci`, `pr-status`
- Require branches to be up to date
- Require code review approval

## Coverage Goals

### Current Status
- Overall: ~49% line coverage
- Target: 80% for critical paths

### Priority Areas
1. Authentication services
2. API route handlers
3. Core business logic
4. Error handling paths

## Monitoring Test Results

### PR Comments
Automated comments show:
- Test execution status
- Coverage reports
- Links to detailed results

### Codecov Integration
- Coverage trends over time
- PR coverage diff
- File-level coverage details

### GitHub Actions UI
- Workflow run details
- Test output logs
- Coverage artifacts

## Best Practices

1. **Write tests first** - TDD approach for new features
2. **Don't skip failing tests** - Fix them or document why
3. **Keep tests fast** - Mock external services
4. **Test edge cases** - Not just happy paths
5. **Monitor coverage** - Don't let it decrease

## Troubleshooting

### Common Issues

**Tests pass locally but fail in CI:**
- Check environment variables
- Verify database migrations
- Look for timing/race conditions

**Coverage reports missing:**
- Ensure `coverage/` directory exists
- Check Bun test runner output
- Verify LCOV generation

**PR checks timeout:**
- Split large test files
- Use test.skip for slow tests
- Parallelize where possible

## Future Improvements

1. **Performance testing** - Add load testing to CI
2. **Visual regression** - For frontend components
3. **Mutation testing** - Ensure test quality
4. **Flaky test detection** - Automatic retries
5. **Test impact analysis** - Run only affected tests