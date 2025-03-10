import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { AnalysisResponse } from '../hooks/useAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RecordingData {
  partner1: string;
  partner2?: string;
}

interface RecordingContextType {
  recordingData: RecordingData | null;
  analysisResult: AnalysisResponse | null;
  conversationId: string | null;
  processingProgress: number;
  setRecordingData: (data: RecordingData | null) => void;
  setAnalysisResult: (result: AnalysisResponse | null) => void;
  setConversationId: (id: string | null) => void;
  setProcessingProgress: (progress: number) => void;
  clearRecordings: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

// Storage keys
const CONVERSATION_ID_KEY = 'vibecheck_conversation_id';

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [recordingData, setRecordingData] = useState<RecordingData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [processingProgress, setProcessingProgressState] = useState<number>(0);

  // Initialize conversation ID from storage on mount
  useEffect(() => {
    const loadConversationId = async () => {
      try {
        const storedId = await AsyncStorage.getItem(CONVERSATION_ID_KEY);
        if (storedId) {
          console.log(`RecordingContext: Loaded conversationId from storage: ${storedId}`);
          setConversationIdState(storedId);
        }
      } catch (error) {
        console.error('Error loading conversation ID from storage:', error);
      }
    };
    
    loadConversationId();
  }, []);

  // Persist conversation ID to storage when it changes
  const setConversationId = useCallback((id: string | null) => {
    console.log(`RecordingContext: Setting conversationId to ${id}`);
    setConversationIdState(id);
    
    // Persist to storage
    if (id) {
      AsyncStorage.setItem(CONVERSATION_ID_KEY, id)
        .then(() => console.log(`Saved conversationId to storage: ${id}`))
        .catch(error => console.error('Error saving conversation ID to storage:', error));
    } else {
      AsyncStorage.removeItem(CONVERSATION_ID_KEY)
        .then(() => console.log('Removed conversationId from storage'))
        .catch(error => console.error('Error removing conversation ID from storage:', error));
    }
  }, []);

  const setProcessingProgress = useCallback((progress: number) => {
    console.log(`RecordingContext: Setting processing progress to ${progress}%`);
    setProcessingProgressState(progress);
  }, []);

  const clearRecordings = useCallback(() => {
    console.log('RecordingContext: Clearing all recording data');
    setRecordingData(null);
    setAnalysisResult(null);
    setProcessingProgressState(0);
    
    // Don't clear conversationId here to prevent issues during transitions
    // The component that calls clearRecordings should explicitly call setConversationId(null)
    // when it's appropriate
  }, []);

  const setRecordingDataCallback = useCallback((data: RecordingData | null) => {
    console.log(`RecordingContext: Setting recording data - ${data ? 'with data' : 'null'}`);
    setRecordingData(data);
  }, []);

  const setAnalysisResultCallback = useCallback((result: AnalysisResponse | null) => {
    console.log(`RecordingContext: Setting analysis result - ${result ? 'with result' : 'null'}`);
    setAnalysisResult(result);
    
    // When we get results, ensure progress is at 100%
    if (result) {
      setProcessingProgressState(100);
    }
  }, []);

  return (
    <RecordingContext.Provider 
      value={{
        recordingData,
        analysisResult,
        conversationId,
        processingProgress,
        setRecordingData: setRecordingDataCallback,
        setAnalysisResult: setAnalysisResultCallback,
        setConversationId,
        setProcessingProgress,
        clearRecordings,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
} 