# iOS In-App Purchase Receipt Verification

This document explains the implementation of Apple in-app purchase receipt verification in VibeCheck and how to integrate with it.

## Overview

Our subscription verification system handles the secure validation of iOS in-app purchase receipts to verify subscription status. It follows Apple's recommended server-side verification approach to ensure subscription integrity and security.

## Architecture

The implementation consists of:

1. **Server-side verification**: Receipt validation through Apple's verification servers
2. **Database storage**: Secure storage of subscription details
3. **Client integration**: Client-side hooks for communicating with the verification service
4. **Notification handling**: Processing App Store Server Notifications for subscription lifecycle events

## Server Implementation

### Database Schema

Subscription data is stored in a `subscriptions` table with the following structure:

```sql
CREATE TABLE "subscriptions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "original_transaction_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "receipt_data" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "is_active" INTEGER NOT NULL,
  "expires_date" INTEGER,
  "purchase_date" INTEGER NOT NULL,
  "last_verified_date" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
```

### Verification Service

The core functionality is in `server/src/services/subscription.service.ts`:

- `verifyAppleReceipt`: Verifies receipt data with Apple's servers
- `saveSubscription`: Stores verified subscription data
- `hasActiveSubscription`: Checks user subscription status
- `verifyAndSaveSubscription`: Combined verification and storage

### API Endpoints

The API routes are defined in `server/src/api/routes/subscription.routes.ts`:

1. **Receipt Verification**:
   ```
   POST /subscriptions/verify
   ```
   Verifies receipt data and registers a subscription.

2. **Subscription Status**:
   ```
   GET /subscriptions/status
   ```
   Checks if a user has an active subscription.

3. **App Store Notifications**:
   ```
   POST /subscriptions/notifications
   ```
   Handles App Store Server Notifications for subscription events.

## Client Integration

### Available Hooks

The client includes hooks for interacting with the subscription verification system:

1. **useApi**: Enhanced with subscription-related API methods:
   - `verifySubscriptionReceipt`: Sends receipt to server for verification
   - `getSubscriptionStatus`: Checks subscription status with server

2. **useSubscription**: Context provider offering:
   - Subscription status tracking
   - Purchase handling
   - Receipt verification
   - Status restoration

### Example: Handling a Purchase

When a user makes a purchase, the receipt is sent to the server for verification:

```typescript
// Inside handlePurchaseUpdate in SubscriptionContext.tsx
if (receipt) {
  try {
    // Send the receipt to backend for validation
    const { verifySubscriptionReceipt } = useApi();
    const result = await verifySubscriptionReceipt(receipt);
    
    if (result.isSubscribed) {
      // Receipt was verified by the server
      const newSubscriptionInfo = {
        isActive: true,
        type: result.subscription.type,
        expiryDate: result.subscription.expiresDate,
        lastVerified: new Date(),
      };
      
      setSubscriptionInfo(newSubscriptionInfo);
      setIsSubscribed(true);
    }
    
    // Finish the transaction
    await finishTransaction({ purchase, isConsumable: false });
  } catch (err) {
    console.error('Error processing purchase:', err);
  }
}
```

### Example: Checking Subscription Status

To check if a user has an active subscription:

```typescript
const { isSubscribed } = useSubscription();

// or to check and get details
const { subscriptionInfo } = useSubscription();
if (subscriptionInfo?.isActive) {
  // User has active subscription
  const { type, expiryDate } = subscriptionInfo;
  // ...
}
```

## Configuration

### Environment Variables

Configure the following environment variables:

```
APPLE_SHARED_SECRET=your_apple_shared_secret_here
```

### App Store Connect Configuration

1. **Generate Shared Secret**:
   - Log into [App Store Connect](https://appstoreconnect.apple.com)
   - Navigate to "My Apps" > Your App > "App Information"
   - Find "App-Specific Shared Secret" and generate or view it
   - Copy the secret into your `.env` file

2. **Configure Server Notifications**:
   - In App Store Connect, go to "My Apps" > Your App > "App Information"
   - Set the "Server URL" for App Store Server Notifications:
     ```
     https://your-domain.com/subscriptions/notifications
     ```

## Testing

### Sandbox Testing

For sandbox testing:

1. Use sandbox test accounts in iOS app
2. Verify environment is correctly identified as 'Sandbox' in logs
3. Check receipt verification is successful
4. Test subscription lifecycle events (renewal, expiration)

### Production Testing

Before going live:

1. Test with production receipts
2. Verify server notifications are working
3. Test restoring purchases
4. Validate expiration and renewal handling

## Security Considerations

1. **Safe Storage**: Never store Apple shared secret in client code
2. **Receipt Validation**: Always validate receipts server-side
3. **Environments**: Handle both sandbox and production environments
4. **Data Protection**: Securely store receipt and subscription data
5. **Renewal Handling**: Implement reliable notification processing for subscription renewals/expirations

## Troubleshooting

### Common Status Codes

| Status | Meaning |
|--------|---------|
| 0 | Success |
| 21000 | App Store could not read the receipt |
| 21002 | Receipt data invalid or missing |
| 21004 | Shared secret incorrect |
| 21007 | Receipt from test environment, but sent to production |
| 21008 | Receipt from production environment, but sent to test |

### Common Issues

1. **Receipt validation fails**: Verify shared secret is correct
2. **Environment mismatch**: Ensure you're using the correct verification URL
3. **Missing transaction details**: Check receipt formation in the client app

## References

- [Apple In-App Purchase Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications)
- [App Store Receipt Validation](https://developer.apple.com/documentation/storekit/in-app_purchase/validating_receipts_with_the_app_store)
- [node-apple-receipt-verify](https://www.npmjs.com/package/node-apple-receipt-verify) 