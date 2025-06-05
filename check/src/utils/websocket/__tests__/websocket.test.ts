import { describe, it, expect, beforeEach, afterEach, mock, beforeAll, afterAll } from 'bun:test'
import WebSocket, { WebSocketServer } from 'ws'
import { EventEmitter } from 'events'
import * as websocketCore from '../core'
import * as websocketState from '../state'
import * as websocketAuth from '../auth'
import * as websocketHandlers from '../handlers'
import * as websocketMessaging from '../messaging'
import { redisClient } from '../../../config'
import { verifySessionToken } from '../../../services/session-service'
import { log } from '../../../utils/logger'
import { createAuthToken, createAuthenticatedUser } from '../../../test/utils/auth'
import { TestDatabase, testDb } from '../../../test/utils/database'
import { UserFactory } from '../../../test/factories'

// Mock Redis
mock.module('../../../config', () => ({
  redisClient: {
    lRange: mock(() => Promise.resolve([])),
    rPush: mock(() => Promise.resolve(1)),
    lTrim: mock(() => Promise.resolve('OK')),
    expire: mock(() => Promise.resolve(1)),
    del: mock(() => Promise.resolve(1)),
    lLen: mock(() => Promise.resolve(0)),
    publish: mock(() => Promise.resolve(1)),
    subscribe: mock(() => Promise.resolve()),
    unsubscribe: mock(() => Promise.resolve()),
    on: mock(() => {}),
    quit: mock(() => Promise.resolve()),
  }
}))

// Mock logger
mock.module('../../../utils/logger', () => ({
  log: {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  }
}))

// Mock session service
mock.module('../../../services/session-service', () => ({
  verifySessionToken: mock(() => Promise.resolve(null))
}))

describe('WebSocket Tests', () => {
  let db: TestDatabase
  let server: WebSocketServer
  let serverPort: number
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    db = await testDb
  })

  afterAll(async () => {
    // Cleanup is automatic
  })

  beforeEach(async () => {
    await db.clean()
    
    // Create test user
    testUser = await UserFactory.create({
      email: 'test@example.com',
      isSubscribed: true
    })
    
    // Create auth token
    authToken = await createAuthToken(testUser.id)
    
    // Mock session verification
    ;(verifySessionToken as any).mockResolvedValue({
      id: testUser.id,
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 3600000)
    })
    
    // Clear all mocks
    Object.values(redisClient).forEach(fn => {
      if (typeof fn === 'function' && fn.mock) {
        fn.mock.calls = []
      }
    })
    
    // Initialize WebSocket server
    serverPort = 8080 + Math.floor(Math.random() * 1000)
    server = await websocketCore.initialize(serverPort)
  })

  afterEach(async () => {
    // Clean up connections
    websocketState.clearAllClients()
    
    // Shutdown server
    if (server) {
      await websocketCore.shutdown()
    }
  })

  describe('Connection Management', () => {
    it('should establish WebSocket connection', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          expect(client.readyState).toBe(WebSocket.OPEN)
          client.close()
          resolve()
        })
      })
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
          client.on('message', (data) => {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'auth_success') resolve()
          })
        })
      }
      
      // Check connection count
      const stats = websocketState.getConnectionStats()
      expect(stats.totalConnections).toBe(3)
      
      // Clean up
      clients.forEach(c => c.close())
    })

    it('should enforce connection limit per user', async () => {
      const clients: WebSocket[] = []
      
      // Create 6 connections (limit is 5)
      for (let i = 0; i < 6; i++) {
        const client = new WebSocket(`ws://localhost:${serverPort}`)
        clients.push(client)
        
        await new Promise<void>((resolve) => {
          client.on('open', () => resolve())
        })
        
        // Authenticate
        client.send(JSON.stringify({ type: 'auth', token: authToken }))
        
        await new Promise<void>((resolve) => {
          client.on('message', (data) => {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'auth_success' || msg.type === 'error') resolve()
          })
        })
      }
      
      // Check that only 5 are authenticated
      const userClients = websocketState.getClientsByUserId().get(testUser.id)
      expect(userClients?.size || 0).toBe(5)
      
      // Clean up
      clients.forEach(c => c.close())
    })

    it('should clean up on client disconnect', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') {
            resolve()
          }
        })
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
      
      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          expect(msg.type).toBe('auth_success')
          expect(msg.userId).toBe(testUser.id)
          resolve()
        })
        
        client.on('error', reject)
      })
      
      client.close()
    })

    it('should reject invalid token', async () => {
      // Mock invalid token
      ;(verifySessionToken as any).mockResolvedValue(null)
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: 'invalid-token' }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          expect(msg.type).toBe('error')
          expect(msg.message).toContain('Authentication failed')
          resolve()
        })
        
        client.on('error', reject)
      })
      
      client.close()
    })

    it('should timeout authentication after 10 seconds', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          // Don't send auth message
        })
        
        client.on('close', (code, reason) => {
          expect(code).toBe(1008) // Policy violation
          expect(reason.toString()).toContain('Authentication timeout')
          resolve()
        })
      })
    }, 15000) // Increase timeout for this test

    it('should handle authentication with expired session', async () => {
      // Mock expired session
      ;(verifySessionToken as any).mockResolvedValue({
        id: testUser.id,
        userId: testUser.id,
        expiresAt: new Date(Date.now() - 1000) // Expired
      })
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          expect(msg.type).toBe('error')
          expect(msg.message).toContain('Authentication failed')
          resolve()
        })
      })
      
      client.close()
    })
  })

  describe('Message Handling', () => {
    let authenticatedClient: WebSocket

    beforeEach(async () => {
      authenticatedClient = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('open', () => {
          authenticatedClient.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') resolve()
        })
      })
    })

    afterEach(() => {
      if (authenticatedClient) {
        authenticatedClient.close()
      }
    })

    it('should handle subscription to topics', async () => {
      const topic = 'conversation:123'
      
      authenticatedClient.send(JSON.stringify({ 
        type: 'subscribe', 
        topic 
      }))
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'subscription_confirmed') {
            expect(msg.topic).toBe(topic)
            resolve()
          }
        })
      })
      
      // Verify subscription in state
      const userClients = websocketState.getClientsByUserId().get(testUser.id)
      const client = userClients ? Array.from(userClients)[0] : null
      expect(client?.subscribedTopics.has(topic)).toBe(true)
    })

    it('should handle unsubscription from topics', async () => {
      const topic = 'conversation:123'
      
      // Subscribe first
      authenticatedClient.send(JSON.stringify({ 
        type: 'subscribe', 
        topic 
      }))
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'subscription_confirmed') resolve()
        })
      })
      
      // Unsubscribe
      authenticatedClient.send(JSON.stringify({ 
        type: 'unsubscribe', 
        topic 
      }))
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'unsubscription_confirmed') {
            expect(msg.topic).toBe(topic)
            resolve()
          }
        })
      })
      
      // Verify unsubscription in state
      const userClients = websocketState.getClientsByUserId().get(testUser.id)
      const client = userClients ? Array.from(userClients)[0] : null
      expect(client?.subscribedTopics.has(topic)).toBe(false)
    })

    it('should handle ping messages', async () => {
      authenticatedClient.send(JSON.stringify({ type: 'ping' }))
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'pong') {
            resolve()
          }
        })
      })
    })

    it('should reject messages before authentication', async () => {
      const unauthClient = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        unauthClient.on('open', () => {
          unauthClient.send(JSON.stringify({ 
            type: 'subscribe', 
            topic: 'conversation:123' 
          }))
        })
        
        unauthClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          expect(msg.type).toBe('error')
          expect(msg.message).toContain('Not authenticated')
          resolve()
        })
      })
      
      unauthClient.close()
    })

    it('should handle malformed messages', async () => {
      authenticatedClient.send('invalid json')
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'error') {
            expect(msg.message).toContain('Invalid message format')
            resolve()
          }
        })
      })
    })

    it('should handle unknown message types', async () => {
      authenticatedClient.send(JSON.stringify({ 
        type: 'unknown-type',
        data: 'test'
      }))
      
      await new Promise<void>((resolve) => {
        authenticatedClient.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'error') {
            expect(msg.message).toContain('Unknown message type')
            resolve()
          }
        })
      })
    })
  })

  describe('Buffered Messages', () => {
    it('should deliver buffered messages on connection', async () => {
      // Mock buffered messages in Redis
      const bufferedMessages = [
        { type: 'conversation_update', conversationId: '123', status: 'completed' },
        { type: 'analysis_ready', conversationId: '123', analysis: 'Test analysis' }
      ]
      ;(redisClient.lRange as any).mockResolvedValue(
        bufferedMessages.map(msg => JSON.stringify(msg))
      )
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      const receivedMessages: any[] = []
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          receivedMessages.push(msg)
          
          if (receivedMessages.length >= 3) { // auth_success + 2 buffered
            resolve()
          }
        })
      })
      
      // Verify buffered messages were delivered
      expect(receivedMessages[0].type).toBe('auth_success')
      expect(receivedMessages[1]).toEqual(bufferedMessages[0])
      expect(receivedMessages[2]).toEqual(bufferedMessages[1])
      
      // Verify Redis operations
      expect(redisClient.lRange).toHaveBeenCalledWith(
        `websocket:messages:${testUser.id}`,
        0,
        -1
      )
      expect(redisClient.del).toHaveBeenCalledWith(
        `websocket:messages:${testUser.id}`
      )
      
      client.close()
    })

    it('should buffer messages for offline users', async () => {
      const message = {
        type: 'conversation_update',
        conversationId: '456',
        status: 'processing'
      }
      
      // Send message to offline user
      await websocketMessaging.sendToUser('offline-user-id', message)
      
      // Verify message was buffered in Redis
      expect(redisClient.rPush).toHaveBeenCalledWith(
        'websocket:messages:offline-user-id',
        JSON.stringify(message)
      )
      expect(redisClient.expire).toHaveBeenCalledWith(
        'websocket:messages:offline-user-id',
        86400 // 24 hours
      )
    })

    it('should limit buffered messages to 100', async () => {
      // Mock Redis to return high message count
      ;(redisClient.lLen as any).mockResolvedValue(105)
      
      const message = {
        type: 'test',
        data: 'new message'
      }
      
      await websocketMessaging.bufferMessage('user-123', message)
      
      // Verify trimming was called
      expect(redisClient.lTrim).toHaveBeenCalledWith(
        'websocket:messages:user-123',
        -100,
        -1
      )
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
          
          client.on('message', (data) => {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'auth_success') {
              // Subscribe to topic
              client.send(JSON.stringify({ type: 'subscribe', topic }))
            } else if (msg.type === 'subscription_confirmed') {
              resolve()
            } else if (msg.type === 'broadcast_test') {
              receivedMessages.push({ clientIndex: i, message: msg })
            }
          })
        })
      }
      
      // Send broadcast message
      const broadcastMsg = { type: 'broadcast_test', data: 'Hello subscribers' }
      await websocketMessaging.sendToSubscribedClients(topic, broadcastMsg)
      
      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // All clients should receive the message
      expect(receivedMessages.length).toBe(3)
      receivedMessages.forEach(({ message }) => {
        expect(message).toEqual(broadcastMsg)
      })
      
      // Clean up
      clients.forEach(c => c.close())
    })

    it('should handle selective broadcasting', async () => {
      const topic1 = 'conversation:111'
      const topic2 = 'conversation:222'
      const client1 = new WebSocket(`ws://localhost:${serverPort}`)
      const client2 = new WebSocket(`ws://localhost:${serverPort}`)
      const messages1: any[] = []
      const messages2: any[] = []
      
      // Setup client 1 - subscribes to topic1
      await new Promise<void>((resolve) => {
        client1.on('open', () => {
          client1.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client1.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          messages1.push(msg)
          if (msg.type === 'auth_success') {
            client1.send(JSON.stringify({ type: 'subscribe', topic: topic1 }))
          } else if (msg.type === 'subscription_confirmed') {
            resolve()
          }
        })
      })
      
      // Setup client 2 - subscribes to topic2
      await new Promise<void>((resolve) => {
        client2.on('open', () => {
          client2.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client2.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          messages2.push(msg)
          if (msg.type === 'auth_success') {
            client2.send(JSON.stringify({ type: 'subscribe', topic: topic2 }))
          } else if (msg.type === 'subscription_confirmed') {
            resolve()
          }
        })
      })
      
      // Send message to topic1
      await websocketMessaging.sendToSubscribedClients(topic1, { 
        type: 'test', 
        topic: topic1 
      })
      
      // Wait and check
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Only client1 should receive the message
      const testMessages1 = messages1.filter(m => m.type === 'test')
      const testMessages2 = messages2.filter(m => m.type === 'test')
      
      expect(testMessages1.length).toBe(1)
      expect(testMessages1[0].topic).toBe(topic1)
      expect(testMessages2.length).toBe(0)
      
      // Clean up
      client1.close()
      client2.close()
    })
  })

  describe('Error Handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          // Force an error by sending invalid data
          client._socket.write('invalid websocket frame')
          resolve()
        })
      })
      
      // Server should continue running
      const testClient = new WebSocket(`ws://localhost:${serverPort}`)
      await new Promise<void>((resolve) => {
        testClient.on('open', () => {
          expect(testClient.readyState).toBe(WebSocket.OPEN)
          testClient.close()
          resolve()
        })
      })
    })

    it('should handle Redis errors gracefully', async () => {
      // Mock Redis error
      ;(redisClient.lRange as any).mockRejectedValue(new Error('Redis error'))
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          // Should still authenticate even if buffered messages fail
          if (msg.type === 'auth_success') {
            resolve()
          }
        })
      })
      
      client.close()
    })
  })

  describe('Performance and Limits', () => {
    it('should handle rapid message sending', async () => {
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      let messageCount = 0
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') {
            // Send 100 messages rapidly
            for (let i = 0; i < 100; i++) {
              client.send(JSON.stringify({ type: 'ping' }))
            }
          } else if (msg.type === 'pong') {
            messageCount++
            if (messageCount === 100) {
              resolve()
            }
          }
        })
      })
      
      expect(messageCount).toBe(100)
      client.close()
    })

    it('should clean up idle connections', async () => {
      // Set short idle timeout for testing
      const originalTimeout = (websocketState as any).IDLE_TIMEOUT_MS
      ;(websocketState as any).IDLE_TIMEOUT_MS = 1000 // 1 second
      
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'auth_success') {
            resolve()
          }
        })
      })
      
      // Verify client is connected
      let stats = websocketState.getConnectionStats()
      expect(stats.totalConnections).toBe(1)
      
      // Trigger idle cleanup
      websocketState.cleanupIdleConnections()
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Run cleanup again
      websocketState.cleanupIdleConnections()
      
      // Verify client was cleaned up
      stats = websocketState.getConnectionStats()
      expect(stats.totalClients).toBe(0)
      
      // Restore original timeout
      ;(websocketState as any).IDLE_TIMEOUT_MS = originalTimeout
    })

    it('should handle memory pressure', async () => {
      // Create many connections
      const clients: WebSocket[] = []
      
      for (let i = 0; i < 10; i++) {
        const client = new WebSocket(`ws://localhost:${serverPort}`)
        clients.push(client)
        
        await new Promise<void>((resolve) => {
          client.on('open', resolve)
        })
      }
      
      // Trigger memory pressure handling
      const closedClients = websocketState.handleMemoryPressure()
      
      // Should close some clients
      expect(closedClients).toBeGreaterThan(0)
      
      // Clean up remaining
      clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.close()
        }
      })
    })
  })

  describe('Integration with Redis Pub/Sub', () => {
    it('should handle Redis pub/sub messages', async () => {
      const topic = 'conversation:999'
      const client = new WebSocket(`ws://localhost:${serverPort}`)
      const receivedMessages: any[] = []
      
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.send(JSON.stringify({ type: 'auth', token: authToken }))
        })
        
        client.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          receivedMessages.push(msg)
          
          if (msg.type === 'auth_success') {
            client.send(JSON.stringify({ type: 'subscribe', topic }))
          } else if (msg.type === 'subscription_confirmed') {
            resolve()
          }
        })
      })
      
      // Simulate Redis pub/sub message
      const pubsubMessage = {
        type: 'conversation_complete',
        conversationId: '999',
        result: 'Analysis complete'
      }
      
      // Directly call the messaging function (simulating Redis pub/sub)
      await websocketMessaging.sendToSubscribedClients(topic, pubsubMessage)
      
      // Wait for message delivery
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Check if message was received
      const conversationMessages = receivedMessages.filter(
        m => m.type === 'conversation_complete'
      )
      expect(conversationMessages.length).toBe(1)
      expect(conversationMessages[0]).toEqual(pubsubMessage)
      
      client.close()
    })
  })
})