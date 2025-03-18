# Authentication System Documentation

## Overview

The VibeCheck application implements a comprehensive authentication system with:

1. Email/password authentication
2. Secure token management
3. Offline authentication support
4. Password reset flow

This document explains the architecture, key components, and flows of the authentication system.

## Token Management Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Application    │──1──▶│  useAuthToken   │──2──▶│  Clerk Auth     │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
        │                        │                        │
        │                        │                        │
        │                        │                        │
        │                      5,6◀──3────────────────────┘
        │                        │
        │                        │
        │                        │
┌───────▼─────────┐              │                ┌─────────────────┐
│                 │              │                │                 │
│  API Requests   │◀─────4───────┘                │  AsyncStorage   │
│                 │                               │                 │
└─────────────────┘                              └─────────────────┘
                                                         ▲
                                                         │
                                                         │
                                                         7
                                                         │
                                                         │
                                                 ┌───────┴─────────┐
                                                 │                 │
                                                 │  Background     │
                                                 │  Operations     │
                                                 │                 │
                                                 └─────────────────┘
```

### Token Flow Steps:

1. Application needs to make an authenticated request
2. `useAuthToken` checks if a valid cached token exists
3. If no valid token exists or it's expiring soon, request a fresh token from Clerk
4. Return the token to make authenticated API requests
5. Parse token metadata (expiry time, etc.)
6. Validate token status (valid, expired, etc.)
7. Store token in AsyncStorage for persistence and background operations

## Authentication Components

### 1. Sign In Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Sign In Screen │──1──▶│  Email/Password │──2──▶│  Clerk Auth     │
│                 │      │  Authentication │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                                                          │
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │                 │
                                                 │  Active Session │
                                                 │                 │
                                                 └─────────────────┘
                                                          │
                                                          │
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │                 │
                                                 │  Redirect to    │
                                                 │  Home Screen    │
                                                 │                 │
                                                 └─────────────────┘
```

### 2. Password Reset Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Forgot Password│──1──▶│  Request Reset  │──2──▶│  Clerk Auth     │
│  Screen         │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                                                  │
        │                                                  │
        │                                                  │
        │                                                  ▼
        │                                         ┌─────────────────┐
        │                                         │                 │
        │                                         │  Email with     │
        │                                         │  Reset Code     │
        │                                         │                 │
        │                                         └─────────────────┘
        │                                                  │
        │                                                  │
        │                                                  │
        │                                                  ▼
        │                                         ┌─────────────────┐
        │                                         │                 │
        │                                         │  User Enters    │
        │                                         │  Code           │
        │                                         │                 │
        │                                         └─────────────────┘
        │                                                  │
        │                                                  │
        │                                                  │
        ▼                                                  ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Set New        │──3──▶│  Validate       │──4──▶│  Update         │
│  Password       │      │  Password       │      │  Password       │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                                                          │
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │                 │
                                                 │  Redirect to    │
                                                 │  Sign In        │
                                                 │                 │
                                                 └─────────────────┘
```

## Token Refresh Strategy

The token refresh strategy uses a sophisticated approach with exponential backoff:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Token Status   │──1──▶│  Refresh        │──2──▶│  Success        │
│  Check          │      │  Token          │      │                 │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │
        │                        │
        │                        │
        │                        │
        │                        ▼
        │                ┌─────────────────┐
        │                │                 │
        │                │  Failure        │
        │                │                 │
        │                └─────────────────┘
        │                        │
        │                        │
        │                        │
        │                        ▼
        │                ┌─────────────────┐      ┌─────────────────┐
        │                │                 │      │                 │
        │                │  Retry with     │──3──▶│  Exponential    │
        │                │  Backoff        │      │  Backoff        │
        │                │                 │      │                 │
        │                └─────────────────┘      └─────────────────┘
        │                        │
        │                        │
        │                        │
        │                        ▼
        │                ┌─────────────────┐
        │                │                 │
        │                │  Max Retries    │
        │                │  Exceeded       │
        │                │                 │
        │                └─────────────────┘
        │                        │
        │                        │
        │                        │
        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  Valid Token    │      │  Invalid Token  │
│  (Continue)     │      │  (Redirect to   │
│                 │      │  Sign In)       │
└─────────────────┘      └─────────────────┘
```

## Offline Authentication

When the device is offline:

1. Cached token validation occurs differently (more lenient)
2. Authentication operations are queued for execution when back online
3. UI adjusts to provide appropriate offline feedback

## Implementation Notes

### Key Components:

- **useAuthToken**: Core hook for token management
- **FormField/PasswordInput**: Reusable form components with validation
- **Network Utilities**: Network status monitoring and caching
- **Validation Utilities**: Input validation with consistent messaging
- **Error Logger**: Structured error handling

### Security Considerations:

- Tokens are securely stored in AsyncStorage
- Sensitive errors are filtered to avoid information leakage
- Network status is verified before authentication operations

## Testing

The authentication system includes:

1. Unit tests for validation functions
2. Unit tests for network utilities
3. Integration tests for token management
4. Edge case tests for offline scenarios

## Future Improvements

Potential enhancements:

1. Implement refresh tokens for longer sessions
2. Add social authentication options
3. Support for multiple accounts
4. Enhanced security with 2FA
5. Passwordless authentication options