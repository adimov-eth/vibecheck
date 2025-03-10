// utils/useApi.ts
import { useCallback, useRef } from 'react';
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

  // Maintain a global mapping of conversation IDs to progress values
  const progressMap = useRef<Map<string, number>>(new Map());
  
  const pollForResult = useCallback(async (conversationId: string, updateProgress: (progress: number) => void) => {
    console.log(`Starting to poll for results, conversationId: ${conversationId}`);
    
    // Get the current progress for this conversation, or initialize it
    let artificialProgress = progressMap.current.get(conversationId) || 5;
    
    // Initialize with 5% if this is the first time
    if (artificialProgress <= 0) {
      artificialProgress = 5;
      updateProgress(5);
    } else {
      // Use the existing progress if it's higher than 5%
      updateProgress(artificialProgress);
    }
    
    progressMap.current.set(conversationId, artificialProgress);
    
    // Use a smaller step for smoother progress
    const progressStep = 1;
    
    // A slower interval means smoother progress updates
    const pollInterval = setInterval(() => {
      // Get current progress from the map
      let currentProgress = progressMap.current.get(conversationId) || artificialProgress;
      currentProgress = Math.min(currentProgress + progressStep, 80);
      
      // Update both the map and the UI
      progressMap.current.set(conversationId, currentProgress);
      updateProgress(currentProgress);
      
      // Update our local variable too
      artificialProgress = currentProgress;
    }, 4000);
    
    const MAX_POLL_RETRIES = 30;
    const BASE_POLLING_INTERVAL = 2000;
    
    let consecutiveErrorCount = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    for (let retryCount = 0; retryCount < MAX_POLL_RETRIES; retryCount++) {
      try {
        console.log(`Polling attempt ${retryCount + 1}/${MAX_POLL_RETRIES} for conversation ${conversationId}`);
        const { status, gptResponse } = await getConversationStatus(conversationId);
        
        // Reset error counter on successful request
        consecutiveErrorCount = 0;
        
        if (status === 'completed' && gptResponse) {
          console.log(`Conversation ${conversationId} completed with response`);
          clearInterval(pollInterval);
          updateProgress(100);
          return parseGptResponse(gptResponse);
        }
        
        if (status === 'failed') {
          console.log(`Conversation ${conversationId} failed`);
          clearInterval(pollInterval);
          throw new Error('Conversation processing failed');
        }
        
        // Status-based progress updates only considered for smooth progression
        // Instead of jumping to 50%, gradually increase to that point
        if (status === 'processing' && artificialProgress < 50) {
          // Move more quickly toward 50% but don't jump
          artificialProgress = Math.min(artificialProgress + 10, 49);
          updateProgress(artificialProgress);
        } else if (status === 'transcribed' && artificialProgress < 70) {
          // Move more quickly toward 70% but don't jump
          artificialProgress = Math.min(artificialProgress + 15, 69);
          updateProgress(artificialProgress);
        }
        
        await new Promise(resolve => setTimeout(resolve, BASE_POLLING_INTERVAL));
      } catch (error) {
        console.error(`Polling error (attempt ${retryCount + 1}/${MAX_POLL_RETRIES}):`, error);
        
        consecutiveErrorCount++;
        if (consecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`Too many consecutive errors (${consecutiveErrorCount}), aborting polling`);
          clearInterval(pollInterval);
          throw new Error('Too many consecutive errors');
        }
        
        if (retryCount === MAX_POLL_RETRIES - 1) {
          clearInterval(pollInterval);
          throw new Error('Max polling attempts reached');
        }
        
        // Backoff on errors
        await new Promise(resolve => setTimeout(resolve, BASE_POLLING_INTERVAL * 2));
      }
    }

    clearInterval(pollInterval);
    throw new Error('Max polling attempts reached without completion');
  }, [getConversationStatus, parseGptResponse]);

  return { createConversation, getConversationStatus, parseGptResponse, pollForResult };
}