// utils/useApi.ts
import { useCallback } from 'react';
import { useAuthToken } from './useAuthToken';

const API_BASE_URL = 'http://192.168.1.66:3000'; // Replace with your server URL
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export interface AnalysisResponse {
  summary: string;
  recommendations: string[];
  highlights: {
    partner1: string[];
    partner2: string[];
  };
}

export interface ConversationStatus {
  status: 'pending' | 'completed' | 'failed';
  gptResponse?: string;
}

export interface ApiHook {
  createConversation: (id: string, mode: string, recordingType: 'separate' | 'live') => Promise<string>;
  getConversationStatus: (conversationId: string) => Promise<ConversationStatus>;
  parseGptResponse: (gptResponse: string) => AnalysisResponse;
  pollForResult: (conversationId: string, updateProgress: (progress: number) => void) => Promise<AnalysisResponse>;
}

export function useApi(): ApiHook {
  const { getFreshToken } = useAuthToken();

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit, retries = 0): Promise<Response> => {
    try {
      const token = await getFreshToken();
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Request failed');
      }
      return response;
    } catch (error) {
      if (retries < MAX_RETRIES) {
        console.log(`Request failed, retrying (${retries + 1}/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, options, retries + 1);
      }
      console.error('Request failed after retries:', error);
      throw error;
    }
  }, [getFreshToken]);

  const createConversation = useCallback(async (id: string, mode: string, recordingType: 'separate' | 'live') => {
    const response = await fetchWithRetry(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ id, mode, recordingType }),
    });
    const data = await response.json();
    if (data.note) console.log('Server note:', data.note);
    return data.conversationId as string;
  }, [fetchWithRetry]);

  const getConversationStatus = useCallback(async (conversationId: string) => {
    const response = await fetchWithRetry(`${API_BASE_URL}/conversations/${conversationId}`, {
      method: 'GET',
    });
    return await response.json() as ConversationStatus;
  }, [fetchWithRetry]);

  const parseGptResponse = useCallback((gptResponse: string): AnalysisResponse => {
    const lines = gptResponse.split('\n').filter(line => line.trim());
    return {
      summary: lines[0] || 'No summary provided',
      recommendations: lines.slice(1).filter(line => line.match(/^\d+\./)).map(line => line.replace(/^\d+\.\s*/, '')) || [],
      highlights: { partner1: [], partner2: [] },
    };
  }, []);

  const pollForResult = useCallback(async (conversationId: string, updateProgress: (progress: number) => void) => {
    const pollInterval = setInterval(() => updateProgress(Math.min(75, Date.now() % 100)), 1000);
    const MAX_POLL_RETRIES = 30;
    const BASE_POLLING_INTERVAL = 2000;

    for (let retryCount = 0; retryCount < MAX_POLL_RETRIES; retryCount++) {
      try {
        const { status, gptResponse } = await getConversationStatus(conversationId);
        if (status === 'completed' && gptResponse) {
          clearInterval(pollInterval);
          updateProgress(100);
          return parseGptResponse(gptResponse);
        }
        if (status === 'failed') {
          clearInterval(pollInterval);
          throw new Error('Conversation processing failed');
        }
        await new Promise(resolve => setTimeout(resolve, BASE_POLLING_INTERVAL));
      } catch (error) {
        console.error(`Polling error (attempt ${retryCount + 1}/${MAX_POLL_RETRIES}):`, error);
        if (retryCount === MAX_POLL_RETRIES - 1) {
          clearInterval(pollInterval);
          throw new Error('Max polling attempts reached');
        }
      }
    }

    clearInterval(pollInterval);
    throw new Error('Max polling attempts reached without completion');
  }, [getConversationStatus, parseGptResponse]);

  return { createConversation, getConversationStatus, parseGptResponse, pollForResult };
}