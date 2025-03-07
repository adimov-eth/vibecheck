import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AnalysisResponse } from '../utils/apiService';

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

  const clearRecordings = () => {
    setRecordingData(null);
    setAnalysisResult(null);
    setConversationId(null);
  };

  return (
    <RecordingContext.Provider 
      value={{
        recordingData,
        analysisResult,
        conversationId,
        setRecordingData,
        setAnalysisResult,
        setConversationId,
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