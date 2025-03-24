export type ConversationStatus = {
  status: 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
};
