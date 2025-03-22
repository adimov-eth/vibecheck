# WebSocket API

This document describes the WebSocket API implemented in the VibeCheck server.

## Connection

Connect to the WebSocket server using the following URL format:

```
wss://your-api-domain/ws?token=<AUTH_TOKEN>
```

The `token` parameter is required and should contain a valid JWT token obtained from the authentication API.

## Authentication

Authentication is handled during the connection phase via the token parameter in the URL. If the token is invalid or missing, the connection will be closed with an error message.

## Message Format

All messages sent to and from the WebSocket server follow this JSON format:

```json
{
  "type": "message_type",
  "payload": {
    // Message-specific data
  },
  "topic": "optional_topic"
}
```

## Subscribing to Topics

To receive updates for specific resources (like conversations), you need to subscribe to topics:

```json
{
  "type": "subscribe",
  "topic": "conversation:12345"
}
```

The server will confirm your subscription with:

```json
{
  "type": "subscribed",
  "topic": "conversation:12345"
}
```

## Unsubscribing from Topics

To stop receiving updates for a topic:

```json
{
  "type": "unsubscribe",
  "topic": "conversation:12345"
}
```

## Message Types

### Server to Client

The server sends the following message types:

#### `connected`

Sent when a client successfully connects to the WebSocket server.

```json
{
  "type": "connected",
  "payload": {
    "message": "Connected to VibeCheck WebSocket server",
    "userId": "user_12345"
  }
}
```

#### `conversation_started`

Sent when a new conversation is created.

```json
{
  "type": "conversation_started",
  "payload": {
    "conversationId": "conv_12345",
    "timestamp": "2025-03-22T14:30:45.123Z",
    "mode": "daily_check_in"
  },
  "topic": "conversation:conv_12345"
}
```

#### `conversation_progress`

Sent when there's an update to the processing status of a conversation.

```json
{
  "type": "conversation_progress",
  "payload": {
    "conversationId": "conv_12345",
    "timestamp": "2025-03-22T14:31:15.456Z",
    "progress": 0.75,
    "stage": "processing_audio"
  },
  "topic": "conversation:conv_12345"
}
```

#### `conversation_completed`

Sent when a conversation analysis is complete.

```json
{
  "type": "conversation_completed",
  "payload": {
    "conversationId": "conv_12345",
    "timestamp": "2025-03-22T14:32:30.789Z",
    "resultUrl": "/conversations/conv_12345/result"
  },
  "topic": "conversation:conv_12345"
}
```

#### `conversation_error`

Sent when there's an error processing a conversation.

```json
{
  "type": "conversation_error",
  "payload": {
    "conversationId": "conv_12345",
    "timestamp": "2025-03-22T14:33:10.123Z",
    "error": "Processing failed",
    "code": "PROCESSING_ERROR"
  },
  "topic": "conversation:conv_12345"
}
```

#### `subscription_updated`

Sent when a user's subscription status changes.

```json
{
  "type": "subscription_updated",
  "payload": {
    "timestamp": "2025-03-22T14:34:00.456Z",
    "status": "active",
    "plan": "premium",
    "expiresAt": "2025-04-22T14:34:00.456Z"
  }
}
```

#### `usage_updated`

Sent when a user's usage metrics change.

```json
{
  "type": "usage_updated",
  "payload": {
    "timestamp": "2025-03-22T14:35:20.789Z",
    "remainingConversations": 8,
    "totalConversations": 10,
    "resetDate": "2025-04-01T00:00:00.000Z"
  }
}
```

#### `user_updated`

Sent when a user's profile is updated.

```json
{
  "type": "user_updated",
  "payload": {
    "timestamp": "2025-03-22T14:36:45.123Z",
    "profile": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

### Client to Server

The client can send the following message types:

#### `subscribe`

Subscribe to a topic to receive updates.

```json
{
  "type": "subscribe",
  "topic": "conversation:conv_12345"
}
```

#### `unsubscribe`

Unsubscribe from a topic.

```json
{
  "type": "unsubscribe",
  "topic": "conversation:conv_12345"
}
```

## Topics

Available topics to subscribe to:

- `conversation:<conversationId>` - Updates for a specific conversation
- More topics may be added in the future

## Connection Management

The WebSocket server implements a ping/pong mechanism to detect stale connections. The client doesn't need to implement anything special, as the WebSocket protocol handles this automatically.

If a connection is inactive for too long, it will be automatically terminated by the server.

## Error Handling

If the server encounters an error while processing a message or if there's an authentication issue, it will close the connection with an appropriate error code and message.

## Examples

### Implementing a WebSocket Client in JavaScript

```javascript
const connectToWebSocket = (token) => {
  const ws = new WebSocket(`wss://api.vibecheck.app/ws?token=${token}`);
  
  ws.onopen = () => {
    console.log('Connected to WebSocket server');
    
    // Subscribe to a conversation
    ws.send(JSON.stringify({
      type: 'subscribe',
      topic: 'conversation:conv_12345'
    }));
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'conversation_progress':
          // Update progress UI
          updateProgressUI(message.payload.progress, message.payload.stage);
          break;
          
        case 'conversation_completed':
          // Show completion UI and load results
          showCompletionUI(message.payload.resultUrl);
          break;
          
        // Handle other message types...
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  };
  
  ws.onclose = (event) => {
    console.log(`WebSocket closed: ${event.code} ${event.reason}`);
    // Implement reconnection logic here
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return ws;
};
```

### Reconnection Strategy

Implement a reconnection strategy with exponential backoff:

```javascript
const connectWithRetry = (token, maxRetries = 5) => {
  let retries = 0;
  let ws = null;
  
  const connect = () => {
    ws = connectToWebSocket(token);
    
    ws.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} ${event.reason}`);
      
      if (retries < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        console.log(`Reconnecting in ${delay}ms...`);
        
        setTimeout(() => {
          retries++;
          connect();
        }, delay);
      } else {
        console.error('Max retries reached, giving up');
      }
    };
  };
  
  connect();
  return {
    close: () => {
      if (ws) {
        // Prevent reconnection when intentionally closing
        ws.onclose = null;
        ws.close();
      }
    }
  };
};
```