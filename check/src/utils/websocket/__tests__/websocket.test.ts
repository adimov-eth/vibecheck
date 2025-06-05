import { describe, it, expect, beforeEach, afterEach, mock, spyOn, beforeAll, afterAll } from 'bun:test'
import { createServer, Server } from 'http'
import WebSocket from 'ws'
import * as websocketCore from '../core'
import * as websocketState from '../state'
import * as websocketMessaging from '../messaging'
import { createAuthToken } from '../../../test/utils/auth'
import { TestDatabase, testDb } from '../../../test/utils/database'
import { UserFactory } from '../../../test/factories'

// Mock Redis client
const mockRedisClient = {
  lRange: () => Promise.resolve([]),
  rPush: () => Promise.resolve(1),
  lTrim: () => Promise.resolve('OK'),
  expire: () => Promise.resolve(1),
  del: () => Promise.resolve(1),
  lLen: () => Promise.resolve(0),
  publish: () => Promise.resolve(1),
  subscribe: () => Promise.resolve(),
  unsubscribe: () => Promise.resolve(),
  on: () => {},
  quit: () => Promise.resolve(),
}

// Mock modules
mock.module('../../../config', () => ({
  redisClient: mockRedisClient
}))

mock.module('../../../utils/logger', () => ({
  log: {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  }
}))

const mockVerifySessionToken = mock(() => Promise.resolve(null))
mock.module('../../../services/session-service', () => ({
  verifySessionToken: mockVerifySessionToken
}))

describe('WebSocket Tests', () => {
  let db: TestDatabase
  let httpServer: Server
  let serverPort: number
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    db = await testDb
  })

  beforeEach(async () => {
    await db.clean()
    
    // Create test user
    testUser = await UserFactory.create({
      email: 'test@example.com'
    })
    
    // Create auth token
    authToken = await createAuthToken(testUser.id)
    
    // Reset mock for session verification
    mockVerifySessionToken.mockClear()
    mockVerifySessionToken.mockResolvedValue({
      id: testUser.id,
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 3600000)
    })
    
    // Create HTTP server
    serverPort = 8080 + Math.floor(Math.random() * 1000)
    httpServer = createServer()
    
    // Initialize WebSocket with the HTTP server
    websocketCore.initialize(httpServer)
    
    // Start HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen(serverPort, resolve)
    })
    
    // Set up upgrade handler
    httpServer.on('upgrade', (request, socket, head) => {
      websocketCore.handleUpgrade(request, socket, head)
    })
  })

  afterEach(async () => {
    // Clean up connections
    websocketState.clearAllClients()
    
    // Shutdown WebSocket
    websocketCore.shutdown()
    
    // Close HTTP server if it exists
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve())
      })
    }
  })

  describe('Connection Management', () => {
    it('should establish WebSocket connection', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      const opened = await new Promise<boolean>((resolve) => {
        client.on('open', () => resolve(true))
        client.on('error', () => resolve(false))
        setTimeout(() => resolve(false), 5000)
      })
      
      expect(opened).toBe(true)
      expect(client.readyState).toBe(WebSocket.OPEN)
      
      client.close()
    })

    it('should handle multiple connections from same user', async () => {
      const clients: WebSocket[] = []
      
      // Create 3 connections
      for (let i = 0; i < 3; i++) {
        const client = new WebSocket(`ws://localhost:${serverPort}`)
        clients.push(client)
        
        await new Promise<void>((resolve) => {
          client.on('open', () => resolve())
        })
        
        // Authenticate
        client.send(JSON.stringify({ type: 'auth', token: authToken }))
        
        await new Promise<void>((resolve) => {
          const handler = (data: any) => {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'auth_success') {
              client.off('message', handler)
              resolve()
            }
          }
          client.on('message', handler)
        })
      }
      
      // Check connection count
      const stats = websocketState.getConnectionStats()
      expect(stats.totalConnections).toBe(3)
      
      // Clean up
      clients.forEach(c => c.close())
    })

    it('should clean up on client disconnect', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        const handler = (data: any) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') {
            client.off('message', handler)
            resolve()
          }
        }
        client.on('message', handler)
      })
      
      // Verify client is connected
      let stats = websocketState.getConnectionStats()
      expect(stats.totalConnections).toBe(1)
      
      // Disconnect
      client.close()
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Verify cleanup
      stats = websocketState.getConnectionStats()
      expect(stats.totalConnections).toBe(0)
    })
  })

  describe('Authentication', () => {
    it('should authenticate with valid token', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      const result = await new Promise<any>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          resolve(msg)
        })
      })
      
      expect(result.type).toBe('auth_success')
      expect(result.userId).toBe(testUser.id)
      
      client.close()
    })

    it('should reject invalid token', async () => {
      // Mock invalid token
      mockVerifySessionToken.mockResolvedValue(null)
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      const result = await new Promise<any>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: 'invalid-token' }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          resolve(msg)
        })
      })
      
      expect(result.type).toBe('error')
      expect(result.message).toContain('Authentication failed')
      
      client.close()
    })

    it('should timeout authentication after 10 seconds', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      const result = await new Promise<{ code: number; reason: string }>((resolve) => {
        client.on('open', () => {
          // Don't send auth message
        })
        
        client.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })
      
      expect(result.code).toBe(4008)
      expect(result.reason).toContain('Authentication timeout')
    }, 15000) // Increase timeout for this test
  })

  describe('Message Handling', () => {
    let authenticatedClient: WebSocket

    beforeEach(async () => {
      authenticatedClient = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('open', () => {
          authenticatedClient.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        const handler = (data: any) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') {
            authenticatedClient.off('message', handler)
            resolve()
          }
        }
        authenticatedClient.on('message', handler)
      })
    })

    afterEach(() => {
      if (authenticatedClient && authenticatedClient.readyState === WebSocket.OPEN) {
        authenticatedClient.close()
      }
    })

    it('should handle subscription to topics', async () => {
      const topic = 'conversation:123'
      
      authenticatedClient.send(JSON.stringify({ 
        type: 'subscribe', 
        payload: { topic }
      }))
      
      const result = await new Promise<any>((resolve) => {
        const handler = (data: any) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'subscription_confirmed') {
            authenticatedClient.off('message', handler)
            resolve(msg)
          }
        }
        authenticatedClient.on('message', handler)
      })
      
      expect(result.topic).toBe(topic)
      
      // Verify subscription in state
      const userClients = websocketState.getClientsByUserId().get(testUser.id)
      const client = userClients ? Array.from(userClients)[0] : null
      expect(client?.subscribedTopics.has(topic)).toBe(true)
    })

    it('should handle ping messages', async () => {
      authenticatedClient.send(JSON.stringify({ type: 'ping' }))
      
      const result = await new Promise<any>((resolve) => {
        const handler = (data: any) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'pong') {
            authenticatedClient.off('message', handler)
            resolve(msg)
          }
        }
        authenticatedClient.on('message', handler)
      })
      
      expect(result.type).toBe('pong')
    })

    it('should reject messages before authentication', async () => {
      const unauthClient = new WebSocket(`ws://localhost:${serverPort}`)
      
      const result = await new Promise<any>((resolve) => {
        unauthClient.on('open', () => {
          unauthClient.send(JSON.stringify({ 
            type: 'subscribe', 
            payload: { topic: 'conversation:123' }
          }))
        })
        
        unauthClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          resolve(msg)
        })
      })
      
      expect(result.type).toBe('error')
      expect(result.message).toContain('Not authenticated')
      
      unauthClient.close()
    })

    it('should handle malformed messages', async () => {
      authenticatedClient.send('invalid json')
      
      const result = await new Promise<any>((resolve) => {
        const handler = (data: any) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'error') {
            authenticatedClient.off('message', handler)
            resolve(msg)
          }
        }
        authenticatedClient.on('message', handler)
      })
      
      expect(result.message).toContain('Invalid JSON message')
    })
  })

  describe('Broadcasting', () => {
    it('should broadcast to subscribed clients', async () => {
      const topic = 'conversation:789'
      const clients: WebSocket[] = []
      const receivedMessages: any[] = []
      
      // Create and authenticate multiple clients
      for (let i = 0; i < 3; i++) {
        const client = new WebSocket(`ws://localhost:${serverPort}`)
        clients.push(client)
        
        await new Promise<void>((resolve) => {
          client.on('open', () => {
            client.send(JSON.stringify({ type: 'auth', token: authToken }))
          })
          
          let authenticated = false
          const handler = (data: any) => {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'auth_success' && !authenticated) {
              authenticated = true
              // Subscribe to topic
              client.send(JSON.stringify({ type: 'subscribe', payload: { topic } }))
            } else if (msg.type === 'subscription_confirmed') {
              client.off('message', handler)
              // Set up listener for broadcast messages
              client.on('message', (data) => {
                const msg = JSON.parse(data.toString())
                if (msg.type === 'broadcast_test') {
                  receivedMessages.push({ clientIndex: i, message: msg })
                }
              })
              resolve()
            }
          }
          client.on('message', handler)
        })
      }
      
      // Send broadcast message
      const broadcastMsg = { 
        type: 'broadcast_test', 
        payload: { data: 'Hello subscribers' },
        timestamp: new Date().toISOString()
      }
      websocketMessaging.sendToSubscribedClients(topic, broadcastMsg)
      
      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // All clients should receive the message
      expect(receivedMessages.length).toBe(3)
      receivedMessages.forEach(({ message }) => {
        expect(message.type).toBe(broadcastMsg.type)
        expect(message.payload).toEqual(broadcastMsg.payload)
      })
      
      // Clean up
      clients.forEach(c => c.close())
    })
  })

  describe('Error Handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          // Force close to trigger error handling
          client.terminate()
          resolve()
        })
      })
      
      // Server should continue running - test with a new connection
      const testClient = new WebSocket(`ws://localhost:${serverPort}`)
      const connected = await new Promise<boolean>((resolve) => {
        testClient.on('open', () => {
          resolve(true)
        })
        testClient.on('error', () => resolve(false))
        setTimeout(() => resolve(false), 1000)
      })
      
      expect(connected).toBe(true)
      
      if (testClient.readyState === WebSocket.OPEN) {
        testClient.close()
      }
    })

    it('should handle Redis errors gracefully', async () => {
      // Mock Redis error
      const lRangeSpy = spyOn(mockRedisClient, 'lRange').mockRejectedValue(new Error('Redis error'))
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      const result = await new Promise<any>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          // Should still authenticate even if buffered messages fail
          if (msg.type === 'auth_success') {
            resolve(msg)
          }
        })
      })
      
      expect(result.type).toBe('auth_success')
      
      client.close()
      lRangeSpy.mockRestore()
    })
  })
})