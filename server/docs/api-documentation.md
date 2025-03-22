# VibeCheck Server API Documentation

This document outlines the RESTful API endpoints available in the VibeCheck server application.

## Base URL

All endpoints are relative to: `/api/v1`

## Authentication

Most endpoints require authentication using Clerk. Include the authentication token in the request header:

```
Authorization: Bearer <token>
```

## Rate Limiting

API requests are subject to rate limiting to prevent abuse. You may receive a `429 Too Many Requests` response if limits are exceeded.

## Endpoints

### Authentication

#### GET `/auth/user`

Returns the authenticated user's information.

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Conversations

#### POST `/conversations`

Creates a new conversation for audio processing.

**Request Body:**
```json
{
  "mode": "feedback",
  "recordingType": "audio"
}
```

**Response:**
```json
{
  "id": "conv_123",
  "userId": "user_123",
  "mode": "feedback",
  "status": "pending",
  "createdAt": "2025-03-22T12:00:00Z"
}
```

#### GET `/conversations/:conversationId`

Retrieves a specific conversation by ID.

**Response:**
```json
{
  "id": "conv_123",
  "userId": "user_123",
  "mode": "feedback",
  "status": "completed",
  "result": {...},
  "createdAt": "2025-03-22T12:00:00Z",
  "completedAt": "2025-03-22T12:05:00Z"
}
```

### Audio

#### POST `/audio`

Uploads an audio file for processing.

**Request:**
- Format: `multipart/form-data`
- Fields:
  - `file`: Audio file (supported formats: webm, wav, m4a)
  - `conversationId`: ID of the conversation

**Response:**
```json
{
  "id": "audio_123",
  "conversationId": "conv_123",
  "status": "processing",
  "fileName": "recording.m4a"
}
```

### Subscriptions

#### POST `/subscriptions/verify`

Verifies a purchase receipt from Apple App Store or Google Play.

**Request Body:**
```json
{
  "platform": "ios",
  "receipt": "receipt_data_string",
  "productId": "premium_monthly"
}
```

**Response:**
```json
{
  "valid": true,
  "expiresAt": "2025-04-22T12:00:00Z",
  "subscriptionId": "sub_123"
}
```

#### GET `/subscriptions/status`

Gets the current user's subscription status.

**Response:**
```json
{
  "active": true,
  "tier": "premium",
  "expiresAt": "2025-04-22T12:00:00Z"
}
```

#### POST `/subscriptions/notifications`

Webhook endpoint for App Store Server Notifications (server-to-server).

### Usage

#### GET `/usage/stats`

Returns the current user's usage statistics.

**Response:**
```json
{
  "used": 5,
  "limit": 10,
  "resetsAt": "2025-04-01T00:00:00Z"
}
```

### Users

#### GET `/users/me`

Gets the current user's profile information.

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2025-01-15T08:30:00Z",
  "subscription": {
    "active": true,
    "tier": "premium"
  }
}
```

#### GET `/users` (Admin Only)

Lists all users (requires admin privileges).

**Response:**
```json
{
  "users": [
    {
      "id": "user_123",
      "email": "user@example.com",
      "createdAt": "2025-01-15T08:30:00Z"
    },
    // ...
  ],
  "total": 150,
  "page": 1,
  "limit": 25
}
```

## WebSocket API

For real-time updates, use the WebSocket connection at:

```
ws://your-server/ws
```

Authentication requires the same token as the REST API, sent during connection handshake.

### Subscription to Conversation Updates

After connecting, subscribe to updates for a specific conversation:

```json
{
  "type": "subscribe",
  "conversationId": "conv_123"
}
```

### Message Types

1. **Progress Updates**
   ```json
   {
     "type": "progress",
     "conversationId": "conv_123",
     "status": "processing",
     "progress": 0.5,
     "step": "analyzing_audio"
   }
   ```

2. **Completion Updates**
   ```json
   {
     "type": "completed",
     "conversationId": "conv_123",
     "result": {...}
   }
   ```

3. **Error Updates**
   ```json
   {
     "type": "error",
     "conversationId": "conv_123",
     "message": "Processing failed"
   }
   ```

## Usage Limits

- Free tier: 10 conversations per month
- Premium subscribers: Unlimited conversations
- Usage resets on the 1st of each month

## Error Responses

All endpoints return standard HTTP status codes:

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Server Error`: Internal server error

Error responses include a JSON body:

```json
{
  "error": true,
  "message": "Description of the error",
  "code": "ERROR_CODE"
}
```