import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { AnalysisResponse } from '../hooks/useAPI';

interface RecordingData {
  partner1: string;
  partner2?: string;
}

interface RecordingContextType {
  recordingData: RecordingData | null;
  analysisResult: AnalysisResponse | null;
  conversationId: string | null;
  setRecordingData: (data: RecordingData | null) => void;
  setAnalysisResult: (result: AnalysisResponse | null) => void;
  setConversationId: (id: string | null) => void;
  clearRecordings: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [recordingData, setRecordingData] = useState<RecordingData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const clearRecordings = useCallback(() => {
    setRecordingData(null);
    setAnalysisResult(null);
    setConversationId(null);
  }, []);

  const setRecordingDataCallback = useCallback((data: RecordingData | null) => {
    setRecordingData(data);
  }, []);

  const setAnalysisResultCallback = useCallback((result: AnalysisResponse | null) => {
    setAnalysisResult(result);
  }, []);

  const setConversationIdCallback = useCallback((id: string | null) => {
    setConversationId(id);
  }, []);

  return (
    <RecordingContext.Provider 
      value={{
        recordingData,
        analysisResult,
        conversationId,
        setRecordingData: setRecordingDataCallback,
        setAnalysisResult: setAnalysisResultCallback,
        setConversationId: setConversationIdCallback,
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