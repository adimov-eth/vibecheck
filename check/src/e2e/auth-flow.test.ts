import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { testDb } from '../test/utils/database'
import { UserFactory } from '../test/factories'
import * as appleAuthModule from '../utils/apple-auth'
import { mock, spyOn } from 'bun:test'

const API_URL = 'http://localhost:3002' // Different port for auth E2E tests

describe('E2E: Authentication Flow', () => {
  let server: any
  let mockVerifyAppleToken: any

  beforeAll(async () => {
    // Start test server
    const { startTestServer } = await import('../test/utils/server')
    server = await startTestServer(3002)
    
    // Initialize test database
    const db = await testDb
    await db.clean()

    // Mock Apple auth
    mockVerifyAppleToken = spyOn(appleAuthModule, 'verifyAppleToken')
  })

  afterAll(async () => {
    if (server) {
      await server.close()
    }
    mockVerifyAppleToken?.mockRestore()
  })

  beforeEach(async () => {
    // Clean database before each test
    const db = await testDb
    await db.clean()
    
    // Reset mocks
    mockVerifyAppleToken?.mockClear()
  })

  describe('User Registration Flow', () => {
    it('should register new user with Apple Sign In', async () => {
      // Mock successful Apple token verification
      mockVerifyAppleToken.mockResolvedValue({
        sub: 'apple-user-12345',
        email: 'newuser@icloud.com',
        email_verified: true
      })

      // Step 1: Initial authentication attempt
      const authResponse = await fetch(`${API_URL}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authorizationCode: 'mock-auth-code-123',
          identityToken: 'mock-identity-token',
          user: {
            email: 'newuser@icloud.com',
            name: {
              firstName: 'John',
              lastName: 'Doe'
            }
          }
        })
      })

      expect(authResponse.status).toBe(200)
      const authData = await authResponse.json()
      
      // Should return user data and tokens
      expect(authData.user).toBeDefined()
      expect(authData.user.email).toBe('newuser@icloud.com')
      expect(authData.user.name).toBe('John Doe')
      expect(authData.token).toBeDefined()
      expect(authData.refreshToken).toBeDefined()

      // Step 2: Use the token to access protected endpoint
      const profileResponse = await fetch(`${API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${authData.token}`
        }
      })

      expect(profileResponse.status).toBe(200)
      const profileData = await profileResponse.json()
      expect(profileData.user.id).toBe(authData.user.id)
      expect(profileData.user.email).toBe('newuser@icloud.com')
    })

    it('should handle existing user login', async () => {
      // Create existing user
      const existingUser = await UserFactory.create({
        email: 'existing@icloud.com',
        appAccountToken: 'apple-user-67890',
        name: 'Existing User'
      })

      // Mock Apple token verification
      mockVerifyAppleToken.mockResolvedValue({
        sub: 'apple-user-67890',
        email: 'existing@icloud.com',
        email_verified: true
      })

      // Login attempt
      const authResponse = await fetch(`${API_URL}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authorizationCode: 'mock-auth-code-456',
          identityToken: 'mock-identity-token'
          // No user object for existing users
        })
      })

      expect(authResponse.status).toBe(200)
      const authData = await authResponse.json()
      
      // Should return existing user data
      expect(authData.user.id).toBe(existingUser.id)
      expect(authData.user.email).toBe('existing@icloud.com')
      expect(authData.user.name).toBe('Existing User')
      expect(authData.token).toBeDefined()
    })
  })

  describe('Token Management', () => {
    it('should refresh access token with valid refresh token', async () => {
      // Create user and get tokens
      const user = await UserFactory.create()
      mockVerifyAppleToken.mockResolvedValue({
        sub: user.appAccountToken,
        email: user.email,
        email_verified: true
      })

      const authResponse = await fetch(`${API_URL}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authorizationCode: 'mock-code',
          identityToken: 'mock-token'
        })
      })

      const { token, refreshToken } = await authResponse.json()

      // Use refresh token to get new access token
      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken
        })
      })

      expect(refreshResponse.status).toBe(200)
      const refreshData = await refreshResponse.json()
      expect(refreshData.token).toBeDefined()
      expect(refreshData.token).not.toBe(token) // Should be new token
      expect(refreshData.refreshToken).toBeDefined()
    })

    it('should reject expired tokens', async () => {
      // Create an expired token
      const user = await UserFactory.create()
      const { createAuthToken } = await import('../test/utils/auth')
      const expiredToken = await createAuthToken(user.id, -3600) // Expired 1 hour ago

      const response = await fetch(`${API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toContain('Token expired')
    })
  })

  describe('Account Security', () => {
    it('should lock account after multiple failed attempts', async () => {
      const user = await UserFactory.create({
        appAccountToken: 'apple-user-locked-test'
      })

      // Mock failed verifications
      mockVerifyAppleToken.mockRejectedValue(new Error('Invalid token'))

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${API_URL}/api/auth/apple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            authorizationCode: 'bad-code',
            identityToken: 'bad-token',
            user: { email: user.email }
          })
        })

        expect(response.status).toBe(401)
      }

      // Next attempt should show account locked
      mockVerifyAppleToken.mockResolvedValue({
        sub: user.appAccountToken,
        email: user.email,
        email_verified: true
      })

      const lockedResponse = await fetch(`${API_URL}/api/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authorizationCode: 'good-code',
          identityToken: 'good-token'
        })
      })

      expect(lockedResponse.status).toBe(403)
      const data = await lockedResponse.json()
      expect(data.error).toContain('Account is locked')
    })

    it('should rate limit authentication attempts', async () => {
      // Make rapid auth attempts
      const promises = []
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          fetch(`${API_URL}/api/auth/apple`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': '192.168.1.100' // Same IP
            },
            body: JSON.stringify({
              authorizationCode: `code-${i}`,
              identityToken: `token-${i}`
            })
          })
        )
      }

      const responses = await Promise.all(promises)
      
      // Some should be rate limited
      const rateLimited = responses.filter(r => r.status === 429)
      expect(rateLimited.length).toBeGreaterThan(0)
      
      // Check rate limit headers
      const limitedResponse = rateLimited[0]
      expect(limitedResponse.headers.get('x-ratelimit-limit')).toBeDefined()
      expect(limitedResponse.headers.get('x-ratelimit-remaining')).toBeDefined()
    })
  })

  describe('Session Management', () => {
    it('should maintain session across requests', async () => {
      const user = await UserFactory.create()
      mockVerifyAppleToken.mockResolvedValue({
        sub: user.appAccountToken,
        email: user.email,
        email_verified: true
      })

      // Login
      const authResponse = await fetch(`${API_URL}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authorizationCode: 'code',
          identityToken: 'token'
        })
      })

      const { token } = await authResponse.json()

      // Make multiple requests with same token
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(
          fetch(`${API_URL}/api/user/profile`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
        )
      }

      const responses = await Promise.all(requests)
      
      // All should succeed
      expect(responses.every(r => r.status === 200)).toBe(true)
      
      // All should return same user data
      const userData = await Promise.all(responses.map(r => r.json()))
      const userIds = userData.map(d => d.user.id)
      expect(new Set(userIds).size).toBe(1) // All same user ID
    })

    it('should invalidate session on logout', async () => {
      const user = await UserFactory.create()
      const { createAuthToken } = await import('../test/utils/auth')
      const token = await createAuthToken(user.id)

      // Verify token works
      const beforeLogout = await fetch(`${API_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      expect(beforeLogout.status).toBe(200)

      // Logout
      const logoutResponse = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      expect(logoutResponse.status).toBe(200)

      // Token should no longer work
      const afterLogout = await fetch(`${API_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      expect(afterLogout.status).toBe(401)
    })
  })
})