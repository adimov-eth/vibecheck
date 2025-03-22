# Usage Limits Implementation

This document explains how usage limits are implemented for free users in the VibeCheck application.

## Overview

VibeCheck implements a freemium model where:
- Free users can create up to 10 conversations per month
- Premium subscribers have unlimited conversations
- Usage limits reset on the 1st of each month

## Architecture

The usage limit system consists of these components:

1. **Database tracking**: Counting conversations by user and date
2. **Server-side enforcement**: Checking limits before creating conversations
3. **Client-side integration**: UI indicators and paywall triggers

## Database Structure

- The `conversations` table includes a `user_id` field to track ownership
- We count conversations by user within the current month's date range
- No separate usage table is needed as we compute counts on demand

## Server Implementation

### Usage Service

The core logic lives in `server/src/services/usage.service.ts`:

- `countUserConversationsThisMonth`: Counts a user's conversations in the current month
- `canCreateConversation`: Checks if a user can create a new conversation based on subscription status and current usage
- `getUserUsageStats`: Returns detailed usage statistics for client display

### API Integration

Usage limits are enforced at the API level:

1. **Conversation Creation**:
   - Before creating a conversation, we check the user's usage with `canCreateConversation`
   - If limit is reached, return HTTP 402 status with usage details
   - The client can use this to direct users to the subscription page

2. **Usage Statistics**:
   - The `/usage/stats` endpoint returns current usage statistics
   - Clients display remaining conversations and next reset date

## Client Integration

### Usage Context

The `UsageContext` provides global access to usage information:

- Current usage statistics
- Helper functions for checking limits
- Formatted strings for UI display

### UI Components

Usage information is displayed in key areas:

- Recording screen shows remaining conversations
- "Upgrade" button appears for free users
- Paywall appears when limits are reached

### Flow Control

1. Before starting a recording, `checkCanCreateConversation` is called
2. If the user is out of free conversations, a dialog appears with subscription options
3. The user can then navigate to the paywall screen or cancel the operation

## Preventing Abuse

Several measures protect against abuse:

1. **Server-side enforcement**: All limit checks happen on the server
2. **User authentication**: All API endpoints require authentication
3. **ID verification**: Users can only access their own conversations
4. **Transaction safety**: Creation and counting use the same database transaction

## Edge Cases Handled

1. **Race conditions**: If multiple requests arrive simultaneously, database consistency ensures correct counting
2. **Month boundaries**: Usage automatically resets at month change
3. **Subscription changes**: When a user subscribes, they immediately get unlimited access
4. **Error states**: If checking fails, default conservative limits apply

## Testing

Test cases cover:

1. Free user within limits can create conversations
2. Free user at limit receives correct error response
3. Premium user can create conversations regardless of count
4. Month rollover correctly resets limits
5. Newly subscribed users get immediate unlimited access

## Configuration

The free tier limit is defined as a constant in `usage.service.ts`:

```typescript
const FREE_TIER_MONTHLY_LIMIT = 10;
```

This can be adjusted as needed without code changes by moving it to environment variables. 