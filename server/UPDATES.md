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

# Database and Performance Enhancements

## Database Connection Pooling

- Implemented connection pooling with `better-sqlite-pool` to manage database connections efficiently
- Configured maximum of 10 connections with 30-second timeout
- Added SQLite optimization pragmas for better performance: 
  - WAL journaling mode
  - Normal synchronous mode 
  - Increased cache and memory-mapped I/O sizes
  - In-memory temporary storage

## Query Optimization

- Added indexes on most frequently queried columns across tables:
  - `users`: email
  - `conversations`: user_id, status, created_at
  - `audios`: conversation_id, user_id, status
  - `subscriptions`: user_id, is_active, expires_date
- Created migration script to apply indexes to existing databases
- Added compound indexes for common query patterns (e.g., user_id + status)

## Transaction Handling

- Improved transaction handling in user service using connection pool
- Created test script to verify transaction isolation and rollback behavior
- Enhanced error handling in database operations

## Database Maintenance

- Created optimization tasks:
  - ANALYZE to update query planner statistics
  - VACUUM to defragment database
  - Integrity checks 
  - Size reporting
- Added scheduled maintenance system that runs at configurable times (default: 3 AM daily)
- Graceful shutdown with proper database connection closure

## Rate Limiting Enhancements

- Implemented configurable rate limiting middleware
- Adjusted limits based on endpoint sensitivity
- Added resource-specific rate limiting for different API sections
- Created in-memory store with automatic cleanup

## Server Improvements

- Added database setup and optimization during server startup
- Improved shutdown process with proper cleanup 
- Documentation of database performance enhancements

## Usage

To run database optimization manually:
```
pnpm run db:optimize
```

To set up the database with indexes and optimizations:
```
pnpm run db:setup
```

## Configuration Options

Database maintenance can be configured using environment variables:
- `ENABLE_MAINTENANCE`: Set to 'false' to disable scheduled maintenance
- `MAINTENANCE_HOUR`: Hour of day (0-23) to run maintenance (default: 3 AM)
- `MAINTENANCE_INTERVAL_MS`: Override interval in milliseconds