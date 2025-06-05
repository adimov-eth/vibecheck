import { describe, it, expect, beforeAll, afterAll, beforeEach, mock, spyOn } from 'bun:test'
import { testDb } from '../test/utils/database'
import { UserFactory, SubscriptionFactory } from '../test/factories'
import { createAuthToken } from '../test/utils/auth'
import type { User, Subscription } from '../database/schema'
import { subscriptions } from '../database/schema'
import { eq } from 'drizzle-orm'
import * as captchaModule from '../services/captcha-service'

const API_URL = 'http://localhost:3004'

// Mock Apple receipt validation response
const mockAppleValidationResponse = {
  status: 0,
  receipt: {
    in_app: [{
      product_id: 'com.vibecheck.premium.monthly',
      transaction_id: '1000000123456789',
      original_transaction_id: '1000000123456789',
      purchase_date_ms: Date.now(),
      expires_date_ms: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      is_trial_period: 'false'
    }]
  },
  latest_receipt_info: [{
    product_id: 'com.vibecheck.premium.monthly',
    transaction_id: '1000000123456789',
    original_transaction_id: '1000000123456789',
    expires_date_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    is_trial_period: 'false',
    is_in_intro_offer_period: 'false'
  }]
}

describe('E2E: Subscription Flow', () => {
  let server: any
  let testUser: User
  let authToken: string
  let mockFetch: any

  beforeAll(async () => {
    // Start test server
    const { startTestServer } = await import('../test/utils/server')
    server = await startTestServer(3004)
    
    // Initialize test database
    const db = await testDb
    await db.clean()

    // Mock Apple receipt validation
    mockFetch = spyOn(global, 'fetch')
  })

  afterAll(async () => {
    if (server) {
      await server.close()
    }
    mockFetch?.mockRestore()
  })

  beforeEach(async () => {
    // Clean database before each test
    const db = await testDb
    await db.clean()
    
    // Create test user
    testUser = await UserFactory.create({
      email: 'subscription.test@example.com'
    })
    
    // Create auth token
    authToken = await createAuthToken(testUser.id)

    // Reset fetch mock
    mockFetch?.mockClear()
  })

  describe('Subscription Purchase', () => {
    it('should handle new subscription purchase', async () => {
      // Mock Apple validation endpoint
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('apple.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockAppleValidationResponse)
          })
        }
        return Promise.resolve({ ok: false })
      })

      // Submit receipt for validation
      const response = await fetch(`${API_URL}/api/subscription/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receipt: 'mock-receipt-data-base64',
          productId: 'com.vibecheck.premium.monthly'
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.subscription).toBeDefined()
      expect(data.subscription.isActive).toBe(true)
      expect(data.subscription.productId).toBe('com.vibecheck.premium.monthly')
      expect(data.subscription.expiresDate).toBeDefined()

      // Verify user now has active subscription
      const profileResponse = await fetch(`${API_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      const profileData = await profileResponse.json()
      expect(profileData.subscription).toBeDefined()
      expect(profileData.subscription.isActive).toBe(true)
    })

    it('should handle subscription renewal', async () => {
      // Create existing subscription
      const existingSubscription = await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: true,
        expiresDate: Math.floor(Date.now() / 1000) + 86400, // Expires tomorrow
        originalTransactionId: '1000000123456789'
      })

      // Mock renewal response
      const renewalResponse = {
        ...mockAppleValidationResponse,
        latest_receipt_info: [{
          ...mockAppleValidationResponse.latest_receipt_info[0],
          transaction_id: '1000000123456790', // New transaction
          expires_date_ms: Date.now() + 60 * 24 * 60 * 60 * 1000 // 60 days
        }]
      }

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('apple.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(renewalResponse)
          })
        }
        return Promise.resolve({ ok: false })
      })

      // Submit renewal receipt
      const response = await fetch(`${API_URL}/api/subscription/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receipt: 'mock-renewal-receipt-base64'
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Should extend expiration date
      expect(data.subscription.expiresDate).toBeGreaterThan(existingSubscription.expiresDate!)
    })

    it('should handle expired subscriptions', async () => {
      // Create expired subscription
      await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: false,
        expiresDate: Math.floor(Date.now() / 1000) - 86400 // Expired yesterday
      })

      // Try to access premium feature
      const response = await fetch(`${API_URL}/api/conversation/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: 'Premium Analysis',
          recordingType: 'separate'
        })
      })

      // Should still allow basic features but may limit premium features
      // Implementation depends on your business logic
      expect([201, 403]).toContain(response.status)
    })
  })

  describe('Usage Limits', () => {
    it('should enforce conversation limits for free users', async () => {
      // User without subscription
      const freeUser = await UserFactory.create({
        email: 'free.user@example.com'
      })
      const freeAuthToken = await createAuthToken(freeUser.id)

      // Create maximum free conversations (e.g., 3 per day)
      const maxFreeConversations = 3
      const promises = []

      for (let i = 0; i < maxFreeConversations; i++) {
        promises.push(
          fetch(`${API_URL}/api/conversation/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${freeAuthToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              mode: 'Daily Standup',
              recordingType: 'audio'
            })
          })
        )
      }

      const responses = await Promise.all(promises)
      expect(responses.every(r => r.status === 200)).toBe(true)

      // Next conversation should be limited
      const limitedResponse = await fetch(`${API_URL}/api/conversation/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freeAuthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: 'Daily Standup',
          recordingType: 'audio'
        })
      })

      // Might return 403 or prompt for upgrade
      expect([403, 402]).toContain(limitedResponse.status)
      const data = await limitedResponse.json()
      expect(data.error).toMatch(/limit|upgrade|subscription/i)
    })

    it('should allow unlimited conversations for premium users', async () => {
      // Create premium subscription
      await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: true,
        productId: 'com.vibecheck.premium.monthly',
        expiresDate: Math.floor(Date.now() / 1000) + 30 * 86400
      })

      // Create many conversations
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(
          fetch(`${API_URL}/api/conversation/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              mode: 'Interview Practice',
              recordingType: 'video'
            })
          })
        )
      }

      const responses = await Promise.all(promises)
      expect(responses.every(r => r.status === 200)).toBe(true)
    })
  })

  describe('Subscription Webhooks', () => {
    it('should handle Apple S2S notifications', async () => {
      // Create subscription
      const subscription = await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: true,
        originalTransactionId: '1000000123456789'
      })

      // Simulate Apple S2S notification
      const notification = {
        notification_type: 'DID_RENEW',
        password: process.env.APPLE_SHARED_SECRET,
        latest_receipt_info: {
          original_transaction_id: '1000000123456789',
          expires_date_ms: Date.now() + 60 * 24 * 60 * 60 * 1000,
          product_id: 'com.vibecheck.premium.monthly'
        }
      }

      const response = await fetch(`${API_URL}/api/subscription/webhook/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notification)
      })

      expect(response.status).toBe(200)

      // Verify subscription was updated
      const updatedSub = await testDb.then(db => 
        db.database.select()
          .from('subscriptions')
          .where('id', '=', subscription.id)
          .first()
      )

      expect(updatedSub?.lastRenewalDate).toBeDefined()
    })

    it('should handle cancellation notifications', async () => {
      const subscription = await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: true,
        originalTransactionId: '1000000123456789'
      })

      const notification = {
        notification_type: 'CANCEL',
        password: process.env.APPLE_SHARED_SECRET,
        latest_receipt_info: {
          original_transaction_id: '1000000123456789',
          cancellation_date_ms: Date.now(),
          cancellation_reason: '1' // Customer canceled
        }
      }

      const response = await fetch(`${API_URL}/api/subscription/webhook/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notification)
      })

      expect(response.status).toBe(200)

      // Verify subscription was canceled
      const canceledSub = await testDb.then(db => 
        db.database.select()
          .from('subscriptions')
          .where('id', '=', subscription.id)
          .first()
      )

      expect(canceledSub?.isActive).toBe(false)
      expect(canceledSub?.cancellationDate).toBeDefined()
    })
  })

  describe('Grace Period Handling', () => {
    it('should handle billing retry period', async () => {
      // Create subscription in grace period
      await SubscriptionFactory.create({
        userId: testUser.id,
        isActive: true,
        expiresDate: Math.floor(Date.now() / 1000) - 86400, // Expired
        gracePeriodExpiresDate: Math.floor(Date.now() / 1000) + 6 * 86400, // 6 days left
        billingRetryAttempt: 1
      })

      // User should still have access
      const response = await fetch(`${API_URL}/api/user/usage`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.hasActiveSubscription).toBe(true)
      expect(data.inGracePeriod).toBe(true)
    })
  })
})