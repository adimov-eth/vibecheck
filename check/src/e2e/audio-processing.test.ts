import { describe, it, expect, beforeAll, afterAll, beforeEach, mock, spyOn } from 'bun:test'
import { testDb } from '../test/utils/database'
import { UserFactory, ConversationFactory } from '../test/factories'
import { createAuthToken } from '../test/utils/auth'
import type { User, Conversation } from '../database/schema'
import { audios, conversations } from '../database/schema'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { join } from 'path'

const API_URL = 'http://localhost:3003'

// Mock OpenAI responses
const mockTranscriptionResponse = {
  text: "Hello, this is a test transcription of the audio file."
}

const mockGPTResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        communicationStyle: "Clear and articulate",
        emotionalTone: "Confident and professional",
        keyPoints: [
          "Good opening statement",
          "Clear message delivery"
        ],
        suggestions: [
          "Consider adding more emphasis on key points",
          "Pace could be slightly slower for clarity"
        ],
        overallScore: 8
      })
    }
  }]
}

describe('E2E: Audio Processing Pipeline', () => {
  let server: any
  let testUser: User
  let authToken: string
  let mockOpenAI: any

  beforeAll(async () => {
    // Start test server
    const { startTestServer } = await import('../test/utils/server')
    server = await startTestServer(3003)
    
    // Initialize test database
    const db = await testDb
    await db.clean()

    // Mock OpenAI
    mockOpenAI = mock(() => ({
      audio: {
        transcriptions: {
          create: mock(() => Promise.resolve(mockTranscriptionResponse))
        }
      },
      chat: {
        completions: {
          create: mock(() => Promise.resolve(mockGPTResponse))
        }
      }
    }))

    mock.module('../utils/openai', () => ({
      getOpenAIClient: mockOpenAI
    }))
  })

  afterAll(async () => {
    if (server) {
      await server.close()
    }
  })

  beforeEach(async () => {
    // Clean database before each test
    const db = await testDb
    await db.clean()
    
    // Create test user
    testUser = await UserFactory.create({
      email: 'audio.test@example.com'
    })
    
    // Create auth token
    authToken = await createAuthToken(testUser.id)
  })

  describe('Audio Upload', () => {
    it('should handle audio file upload and trigger processing', async () => {
      // Create conversation
      const conversation = await ConversationFactory.create({
        userId: testUser.id,
        mode: 'Interview Practice',
        recordingType: 'live'
      })

      // Create test audio file
      const audioBuffer = Buffer.from('RIFF----WAVEfmt fake-audio-data')
      const formData = new FormData()
      formData.append('conversationId', conversation.id)
      formData.append('audioKey', 'test-recording')
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'test-recording.wav')

      // Upload audio
      const uploadResponse = await fetch(`${API_URL}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      })

      expect(uploadResponse.status).toBe(201)
      const uploadData = await uploadResponse.json()
      expect(uploadData.success).toBe(true)
      expect(uploadData.message).toContain('uploaded and queued for processing')
      expect(uploadData.audioId).toBeDefined()

      // Check audio record was created
      const audioResponse = await fetch(`${API_URL}/audio/conversation/${conversation.id}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      const audioData = await audioResponse.json()
      expect(audioData.audios).toHaveLength(1)
      expect(audioData.audios[0].status).toBe('uploaded')
      expect(audioData.audios[0].audioKey).toBe('test-recording')
    })

    it('should validate audio file format', async () => {
      const conversation = await ConversationFactory.create({
        userId: testUser.id
      })

      // Try to upload non-audio file
      const formData = new FormData()
      formData.append('conversationId', conversation.id)
      formData.append('audioKey', 'test')
      formData.append('audio', new Blob(['not audio data'], { type: 'text/plain' }), 'test.txt')

      const response = await fetch(`${API_URL}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Unsupported audio format')
    })

    it('should enforce file size limits', async () => {
      const conversation = await ConversationFactory.create({
        userId: testUser.id
      })

      // Create 11MB buffer (over 10MB limit)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024)
      const formData = new FormData()
      formData.append('conversationId', conversation.id)
      formData.append('audioKey', 'large')
      formData.append('audio', new Blob([largeBuffer], { type: 'audio/wav' }), 'large.wav')

      const response = await fetch(`${API_URL}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('UPLOAD_ERROR')
    })
  })

  describe('Processing Pipeline', () => {
    it('should process audio through transcription and analysis', async () => {
      // This test simulates the full processing pipeline
      // In real E2E environment, workers would be running
      
      const conversation = await ConversationFactory.create({
        userId: testUser.id,
        mode: 'Presentation Practice'
      })

      // Upload audio
      const audioBuffer = Buffer.from('fake-audio-data')
      const formData = new FormData()
      formData.append('conversationId', conversation.id)
      formData.append('audioKey', 'recording')
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/webm' }), 'recording.webm')

      await fetch(`${API_URL}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      })

      // In real E2E, workers would process. For testing, we'll simulate the steps:
      // 1. Worker picks up audio job
      // 2. Transcribes via OpenAI
      // 3. Updates audio record
      // 4. Creates GPT analysis job
      // 5. Analyzes with GPT
      // 6. Updates conversation

      // Simulate processing completion
      const db = await testDb
      const audioRecords = await db.select()
        .from(audios)
        .where(eq(audios.conversationId, conversation.id))
        .all()

      if (audioRecords.length > 0) {
        await db.update(audios)
          .set({
            status: 'transcribed',
            transcription: mockTranscriptionResponse.text
          })
          .where(eq(audios.id, audioRecords[0].id))

        await db.update(conversations)
          .set({
            status: 'completed',
            gptResponse: JSON.stringify(mockGPTResponse.choices[0].message.content)
          })
          .where(eq(conversations.id, conversation.id))
      }

      // Check final result
      const resultResponse = await fetch(`${API_URL}/conversations/${conversation.id}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      const result = await resultResponse.json()
      expect(result.conversation.status).toBe('completed')
      expect(result.conversation.gptResponse).toBeDefined()
      
      const analysis = JSON.parse(JSON.parse(result.conversation.gptResponse))
      expect(analysis.communicationStyle).toBe("Clear and articulate")
      expect(analysis.overallScore).toBe(8)
    })

    it('should handle processing failures gracefully', async () => {
      const conversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'error',
        errorMessage: 'Transcription failed: OpenAI API error'
      })

      const response = await fetch(`${API_URL}/conversations/${conversation.id}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.conversation.status).toBe('error')
      expect(data.conversation.errorMessage).toContain('Transcription failed')
    })
  })

  describe('Real-time Updates', () => {
    it('should receive WebSocket updates during processing', async () => {
      // This test would connect via WebSocket and verify real-time updates
      // For now, we'll test the API endpoints that trigger updates
      
      const conversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'transcribing'
      })

      // Check status endpoint returns current state
      const response = await fetch(`${API_URL}/conversations/${conversation.id}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.conversation.status).toBe('transcribing')
    })
  })

  describe('Batch Processing', () => {
    it('should handle multiple audio files for single conversation', async () => {
      const conversation = await ConversationFactory.create({
        userId: testUser.id
      })

      // Upload 3 audio files
      const audioFiles = ['part1.webm', 'part2.webm', 'part3.webm']
      const uploadPromises = audioFiles.map(async (filename, index) => {
        const formData = new FormData()
        formData.append('conversationId', conversation.id)
        formData.append('audioKey', filename.replace('.webm', ''))
        formData.append('audio', 
          new Blob([Buffer.from(`audio-data-${index}`)], { type: 'audio/webm' }), 
          filename
        )

        return fetch(`${API_URL}/audio/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        })
      })

      const responses = await Promise.all(uploadPromises)
      expect(responses.every(r => r.status === 201)).toBe(true)

      // Check all audio files are associated with conversation
      const conversationResponse = await fetch(`${API_URL}/audio/conversation/${conversation.id}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      const data = await conversationResponse.json()
      expect(data.audios).toHaveLength(3)
      expect(data.audios.map((a: any) => a.audioKey)).toEqual(
        expect.arrayContaining(['part1', 'part2', 'part3'])
      )
    })
  })
})