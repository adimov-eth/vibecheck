export interface AnalysisResponse {
  status: 'processing' | 'completed' | 'error';
  summary?: string;
  recommendations?: string[];
  progress?: number;
  error?: string;
} 