# API Request Optimization Implementation

This document outlines the changes made to optimize API requests and reduce excessive server load in the application.

## Overview of Changes

We've implemented several optimizations to address the issue of excessive API requests:

1. **Token Request Deduplication**: Fixed the `useAuthToken` hook to properly deduplicate token requests.
2. **Centralized Auth Token Management**: Created a singleton provider to ensure only one instance of the auth hook exists.
3. **WebSocket Implementation**: Added WebSocket support for real-time updates instead of polling.
4. **API Rate Limiting**: Implemented client-side rate limiting to prevent request flooding.
5. **Optimized API Client**: Created an improved API client with category-based rate limiting.

## Implementation Details

### 1. Token Request Deduplication

- Fixed type issue with `globalRefreshPromise` in `useAuthToken.ts`
- Implemented proper global promise tracking for concurrent refresh attempts
- Added rate limiting between refresh attempts

### 2. Centralized Auth Token Management

- Created `AuthTokenProvider.tsx` to maintain a single instance of the auth token hook
- Exported `useGlobalAuthToken` hook to replace direct usage of `useAuthToken`
- Updated app layout to wrap components with this provider

### 3. WebSocket Implementation

- Added `websocketManager.ts` for real-time communication
- Implemented WebSocket connection with automatic reconnection
- Added message queueing for offline support

### 4. API Rate Limiting

- Created `apiRateLimiter.ts` for client-side rate limiting
- Implemented request queueing and prioritization
- Added category-based rate limits for different API endpoints

### 5. Optimized API Client

- Developed `apiClient.ts` with integrated rate limiting and token management
- Added endpoint categorization for differential rate limiting
- Created helper methods for common HTTP operations

## Implementation Steps

### Step 1: Update Dependencies

Make sure your project has the necessary dependencies:

```bash
pnpm add @react-native-async-storage/async-storage react-native-safe-area-context
```

### Step 2: Replace Files

Replace or create the following files:

1. `app/hooks/useAuthToken.ts` (modified)
2. `app/providers/AuthTokenProvider.tsx` (new)
3. `app/utils/websocketManager.ts` (new)
4. `app/utils/apiRateLimiter.ts` (new)
5. `app/utils/apiClient.ts` (new)
6. `app/_layout.tsx` (modified)

### Step 3: Update Components

Update your components to use the new utilities:

1. Replace direct `useAuthToken` calls with `useGlobalAuthToken`
2. Replace direct fetch calls with the `useApiClient` hook
3. For real-time updates, use `useWebSocketManager` instead of polling

### Example Usage:

```typescript
import { useGlobalAuthToken } from '../providers/AuthTokenProvider';
import { useApiClient } from '../utils/apiClient';
import { useWebSocketManager } from '../utils/websocketManager';

function MyComponent() {
  // Use the global auth token hook
  const { validateToken } = useGlobalAuthToken();
  
  // Use the optimized API client
  const api = useApiClient();
  
  // Use WebSockets for real-time updates
  const wsManager = useWebSocketManager('wss://api.example.com/ws');
  
  const fetchData = async () => {
    try {
      // Use the API client for requests
      const data = await api.get('/endpoint');
      // Process data...
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };
  
  // Listen for WebSocket messages
  useEffect(() => {
    if (wsManager.lastMessage?.type === 'data_update') {
      // Handle real-time update...
    }
  }, [wsManager.lastMessage]);
  
  // Rest of component...
}
```

## Server-side Recommendations

For optimal performance, also implement these server-side optimizations:

1. **Database Connection Pooling**: Implement connection pooling to handle concurrent requests efficiently.
2. **Server-side Rate Limiting**: Add rate limiting middleware to protect endpoints from excessive requests.
3. **WebSocket Support**: Set up a WebSocket server for real-time updates instead of requiring polling.
4. **Response Caching**: Implement caching for frequently requested and rarely changing data.
5. **Query Optimization**: Ensure database queries are optimized with proper indexes.

## Additional Notes

- The WebSocket implementation assumes your backend supports WebSockets. If not, you'll need to implement that as well.
- Rate limiting settings can be adjusted based on your application's specific needs and server capacity.
- Consider implementing a monitoring system to track API usage and adjust rate limits accordingly. 