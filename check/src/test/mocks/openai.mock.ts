import { mock } from 'bun:test';

export class MockOpenAIService {
  transcribeAudio = mock(async (audioPath: string) => ({
    text: 'This is a mock transcription of the audio file. The conversation discusses various topics including personal growth and self-reflection.'
  }));
  
  analyzeConversation = mock(async (transcript: string) => ({
    summary: 'Mock analysis summary: The conversation covered personal development topics with a focus on goal setting and emotional awareness.',
    sentiment: 'positive',
    mood: 'calm',
    keyPoints: [
      'Discussed importance of setting clear goals',
      'Explored emotional responses to challenges',
      'Identified strategies for personal growth'
    ],
    recommendations: [
      'Continue practicing mindfulness techniques',
      'Set specific, measurable goals for next session'
    ],
    topics: ['personal development', 'goal setting', 'emotional intelligence'],
    speakerInsights: {
      engagement: 'high',
      clarity: 'good',
      emotionalState: 'stable'
    }
  }));
  
  generateResponse = mock(async (prompt: string) => 
    `Mock AI response to prompt: "${prompt}". This is a helpful and contextual response.`
  );
  
  generateEmbedding = mock(async (text: string) => {
    // Return mock embedding vector
    return Array(1536).fill(0).map(() => Math.random() * 2 - 1);
  });
  
  // Helper to simulate API errors
  simulateError(method: 'transcribe' | 'analyze' | 'generate') {
    const error = new Error('OpenAI API Error: Rate limit exceeded');
    (error as any).status = 429;
    
    switch (method) {
      case 'transcribe':
        this.transcribeAudio.mockRejectedValueOnce(error);
        break;
      case 'analyze':
        this.analyzeConversation.mockRejectedValueOnce(error);
        break;
      case 'generate':
        this.generateResponse.mockRejectedValueOnce(error);
        break;
    }
  }
  
  // Reset all mocks
  reset() {
    this.transcribeAudio.mockReset();
    this.analyzeConversation.mockReset();
    this.generateResponse.mockReset();
    this.generateEmbedding.mockReset();
  }
}

export const mockOpenAI = new MockOpenAIService();