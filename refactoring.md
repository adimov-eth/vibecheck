


## Duplicated Logic Areas

### 1. Upload and Recording Flow Logic

### 2. Results Fetching Logic

### 3. Subscription Status Checking

### 4. Network and Connectivity Logic

### 5. Authentication State Management


## Reactoring Plan


### 1. Implement a State Management Library

Use a state management library Zustand to centralize your application state. Pay attention to propely integrate app initialization, React Query, WebSocket and Clerk. As for Zustand code — define interfaces, but skip implementation for any logic beyond initialization.

```typescript
// Example with Zustand
import create from 'zustand';

const useStore = create((set) => ({
  // Recording state
  recording: {
    isRecording: false,
    conversationId: null,
    // ... other recording state
  },
  
  // Auth state
  auth: {
    token: null,
    isLoggedIn: false,
    // ... other auth state
  },
  
  // Subscription state
  subscription: {
    isSubscribed: false,
    plan: null,
    // ... other subscription state
  },
  
  // Actions
  startRecording: () => set(state => ({...})),
  stopRecording: () => set(state => ({...})),
  // ... other actions
}));
```



### 2. Network and Connectivity Logic => Create a Network Service

Network status checking and handling is duplicated in:
- `network.ts` utility
- `offline-auth.ts` utility 
- `apiClient.ts` implementation
- Direct checks in components

#### Consolidate network and connectivity logic:

```typescript
// services/NetworkService.ts
export class NetworkService {
  isOnline() {...}
  monitorNetworkStatus(callback) {...}
  handleOfflineOperation(operation) {...}
}
```


### 3. Create a Unified API Client

Create a single API client that handles all API interactions:

```typescript
// services/ApiClient.ts
export class ApiClient {
  // Authentication methods
  getToken() {...}
  refreshToken() {...}
  
  // Conversation methods
  createConversation(data) {...}
  getConversationStatus(id) {...}
  getConversationResults(id) {...}
  
  // Subscription methods
  getSubscriptionStatus() {...}
  verifyPurchase(receipt) {...}
  
  // Usage methods
  getUserUsage() {...}
}
```






### 4. Upload and Recording Flow Logic => Create a Unified Recording Service

There are two overlapping implementations of the recording and upload flow:
- `useRecordingFlow.ts` hook
- Direct implementation in `RecordingScreen.tsx`

These contain similar logic for:
- Starting/stopping recordings
- Managing upload state
- Error handling
- Polling for results

The ideal solution would be to consolidate this logic entirely into the `useRecordingFlow` hook and ensure all components use it consistently.



#### Consolidate all recording logic into a single service:

```typescript
// services/RecordingService.ts
export class RecordingService {
  // Consolidated recording methods
  startRecording(params) {...}
  stopRecording(params) {...}
  uploadRecording(params) {...}
  pollForResults(params) {...}
  cleanup() {...}
}

// Custom hook wrapper
export function useRecordingService() {
  const service = useMemo(() => new RecordingService(), []);
  // Additional hook-specific logic
  return service;
}
```
## Summary of Affected Files

Here’s a concise list of all files related or affected by this refactoring:

### New File
- `services/RecordingService.ts`: Core service with all recording logic.

### Modified Hooks
- `hooks/useAudioRecording.ts`: Delegates recording logic to the service.
- `hooks/useUpload.ts`: Delegates upload logic to the service.
- `hooks/useAPI.ts`: Delegates polling logic to the service.

### Modified Components
- `components/RecordingScreen.tsx`: Uses the service for recording operations.

### Unmodified (but Related)
- `contexts/RecordingContext.tsx`: Provides state to the service.

### Potentially Modified Utilities
- `utils/backgroundUpload.ts`: May need adjustments to work with the service.



## Next problems


### 1. Authentication State Management

Auth state management has duplication between:
- Clerk's built-in hooks
- Custom `useAuthToken.ts` hook
- `AuthTokenProvider.tsx` context

### 2. Subscription Status Checking

Subscription status checking is duplicated across:
- `useSubscriptionCheck.ts` hook
- `useUsage.ts` hook
- Direct implementation in `PaywallScreen.tsx`

These all perform similar checks to determine if a user can access premium features.

### 3. Results Fetching Logic

There are multiple implementations for fetching conversation results:
- `useResults.ts` hook
- `useWebSocketResults.ts` hook
- Direct API calls in some components

Both hooks handle polling, WebSocket connections, and error states, but with slightly different implementations. This creates confusion about which hook should be used in which scenario.




### 5. Deduplicate WebSocket and Polling Logic

Create a single, unified results fetching service that intelligently decides between WebSockets and polling:

```typescript
// services/ResultsService.ts
export class ResultsService {
  constructor(options = {}) {
    this.preferWebSockets = options.preferWebSockets ?? true;
  }

  fetchResults(conversationId) {
    if (this.preferWebSockets && this.isWebSocketAvailable()) {
      return this.fetchViaWebSocket(conversationId);
    } else {
      return this.fetchViaPolling(conversationId);
    }
  }

  private fetchViaWebSocket(conversationId) {...}
  private fetchViaPolling(conversationId) {...}
  private isWebSocketAvailable() {...}
}
```

## Additional Architecture Recommendations

1. **Create a Services Layer**: Implement a services layer between your UI components and hooks to handle business logic.

2. **Implement the Repository Pattern**: Create repositories for each data domain (conversations, users, subscriptions) to abstract data access.

3. **Use Dependency Injection**: Consider implementing a simple dependency injection system to make testing easier and reduce coupling.

4. **Implement Feature Flags**: Add a feature flag system to safely roll out new features and handle different subscription tiers.

By addressing these areas of duplication and implementing these architectural improvements, your codebase will be more maintainable, easier to test, and less prone to bugs caused by inconsistent implementations of the same logic.