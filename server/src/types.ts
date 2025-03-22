export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Conversation {
  id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  gptResponse?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Audio {
  id: number;
  conversationId: string;
  userId: string;
  audioFile?: string;
  transcription?: string;
  status: 'uploaded' | 'processing' | 'transcribed' | 'failed';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface AudioJob {
  audioId: number;
  conversationId: string;
}
export interface GptJob {
  conversationId: string;
}
