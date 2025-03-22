# VibeCheck Updates Documentation

## Database Schema Updates

We've made significant changes to the database structure to improve user and subscription management:

### New Tables

1. **Users Table**
   - Primary table for storing user information
   - Syncs automatically with Clerk on authentication
   - Schema:
     ```sql
     CREATE TABLE users (
       id TEXT PRIMARY KEY NOT NULL,  /* Clerk user ID */
       email TEXT,
       name TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     );
     ```

2. **Subscriptions Table**
   - Properly tracks user subscriptions with foreign key constraints
   - Schema:
     ```sql
     CREATE TABLE subscriptions (
       id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
       user_id TEXT NOT NULL,
       product_id TEXT NOT NULL,
       type TEXT NOT NULL,                   /* 'monthly', 'yearly' */
       original_transaction_id TEXT NOT NULL,
       transaction_id TEXT NOT NULL,
       receipt_data TEXT NOT NULL,           /* Base64 encoded receipt */
       environment TEXT NOT NULL,            /* 'Production', 'Sandbox' */
       is_active INTEGER NOT NULL,
       expires_date INTEGER,
       purchase_date INTEGER NOT NULL,
       last_verified_date INTEGER NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
     );
     ```

### Updated Tables

- Added foreign key constraints to `conversations` and `audios` tables
- All tables now reference `users.id` for proper data integrity

## New API Endpoints

### User Management

1. **Get Current User**
   - `GET /users/me`
   - Returns current user's profile information
   - Requires authentication
   - Response:
     ```json
     {
       "user": {
         "id": "user_123456",
         "email": "user@example.com",
         "name": "John Doe",
         "createdAt": 1642614565,
         "updatedAt": 1642614565
       }
     }
     ```

2. **Get All Users** (Admin only)
   - `GET /users`
   - Lists all users in the system
   - Requires authentication
   - Response:
     ```json
     {
       "users": [
         {
           "id": "user_123456",
           "email": "user1@example.com",
           "name": "User One",
           "createdAt": 1642614565,
           "updatedAt": 1642614565
         },
         /* More users... */
       ]
     }
     ```

## Client App Integration

### Authentication Flow

The server now automatically creates or updates local user records when users authenticate through Clerk. The client app doesn't need to make any changes to take advantage of this feature.

1. User authenticates with Clerk
2. Server middleware syncs user data to local database
3. All API requests use this synchronized user data

### Subscription Management

The subscription verification and management system remains the same from the client perspective:

1. **Verify Receipt**
   - `POST /subscriptions/verify`
   - Body: `{ "receiptData": "base64_encoded_receipt" }`

2. **Check Subscription Status**
   - `GET /subscriptions/status`

3. **Get Usage Stats**
   - `GET /usage/stats`

### User Profile

You can now fetch the user's profile information directly:

```typescript
const fetchUserProfile = async () => {
  const response = await fetch(`${API_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${session.token}`
    }
  });
  return await response.json();
};
```

## Technical Debt Resolved

1. **Data Integrity**: All tables now use proper foreign key constraints
2. **User Management**: Local database now stores user data for faster queries and better relationships
3. **Migration System**: Updated scripts for database migrations

## Implementation Notes

- User data is synced automatically from Clerk on authentication
- Subscription status checks reference the local users table
- Usage limits are enforced based on subscription status and user ID