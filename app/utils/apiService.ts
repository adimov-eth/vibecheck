// utils/apiService.ts
import { useAuth } from '@clerk/clerk-expo';// Assuming useAuth is defined in auth.ts
import * as FileSystem from "expo-file-system";
import { Audio } from 'expo-av';
import { useState, useEffect } from 'react';

const API_BASE_URL = "http://172.20.10.5:3000"; // Replace with your server URL

export interface AnalysisResponse {
  summary: string;
  recommendations: string[];
  highlights: {
    partner1: string[];
    partner2: string[];
  };
}

// Transform into proper React hook
export function useApi() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  
  // Get the token on mount and refresh periodically
  useEffect(() => {
    let mounted = true;
    
    const fetchToken = async () => {
      try {
        const fetchedToken = await getToken();
        if (mounted && fetchedToken) {
          console.log("Token successfully fetched");
          setToken(fetchedToken);
        } else if (mounted) {
          console.error("Failed to get token: Token is empty");
        }
      } catch (error) {
        if (mounted) {
          console.error("Failed to get auth token:", error);
        }
      }
    };
    
    fetchToken();
    
    // Refresh token every 30 minutes
    const refreshInterval = setInterval(fetchToken, 30 * 60 * 1000);
    
    return () => {
      mounted = false;
      clearInterval(refreshInterval);
    };
  }, [getToken]);
  
  const Token = token;
  // Define all the API methods as self-contained functions
  const createConversation = async (mode: string, recordingType: "separate" | "live"): Promise<string> => {
    if (!token) throw new Error("Authentication required");
    
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mode, recordingType }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to create conversation");
    return data.conversationId;
  };
  
  const uploadAudio = async (conversationId: string, audioUri: string): Promise<void> => {
    if (!token) {
      console.error("Auth token is missing for upload");
      throw new Error("Authentication required");
    }
    
    const formData = new FormData();
    const fileName = audioUri.split("/").pop() || "audio.webm";
    
    // Determine the correct MIME type based on file extension
    let mimeType = "audio/webm"; // Default
    if (fileName.endsWith('.m4a')) {
      mimeType = "audio/x-m4a";
    } else if (fileName.endsWith('.wav')) {
      mimeType = "audio/wav";
    }
    
    formData.append("audio", {
      uri: audioUri,
      name: fileName,
      type: mimeType,
    } as any);
    formData.append("conversationId", conversationId);

    const response = await fetch(`${API_BASE_URL}/audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Audio upload failed with status ${response.status}: ${errorText}`);
      throw new Error(errorText || "Failed to upload audio");
    }
  };
  
  const getConversationStatus = async (conversationId: string) => {
    if (!token) throw new Error("Authentication required");
    
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to get conversation status");
    return data;
  };
  
  const parseGptResponse = (gptResponse: string): AnalysisResponse => {
    const lines = gptResponse.split("\n").filter(line => line.trim());
    return {
      summary: lines[0] || "No summary provided",
      recommendations: lines.slice(1).filter(line => line.match(/^\d+\./)).map(line => line.replace(/^\d+\.\s*/, "")) || [],
      highlights: { partner1: [], partner2: [] },
    };
  };
  
  const pollForResult = async (conversationId: string, updateProgress: (progress: number) => void) => {
    const pollInterval = setInterval(() => updateProgress(Math.min(75, Date.now() % 100)), 1000);

    const MAX_RETRIES = 30;
    const BASE_POLLING_INTERVAL = 2000;
    let retryCount = 0;
    let currentPollingInterval = BASE_POLLING_INTERVAL;

    while (retryCount < MAX_RETRIES) {
      try {
        const { status, gptResponse } = await getConversationStatus(conversationId);

        if (status === "completed" && gptResponse) {
          clearInterval(pollInterval);
          updateProgress(100);
          return parseGptResponse(gptResponse);
        }

        if (status === "failed") {
          clearInterval(pollInterval);
          throw new Error("Conversation processing failed");
        }

        retryCount++;
        await new Promise(resolve => setTimeout(resolve, currentPollingInterval));
      } catch (error) {
        retryCount++;
        console.error(`Polling error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
        if (retryCount >= MAX_RETRIES) {
          clearInterval(pollInterval);
          throw new Error("Max polling attempts reached");
        }
        await new Promise(resolve => setTimeout(resolve, currentPollingInterval));
      }
    }

    clearInterval(pollInterval);
    throw new Error("Max polling attempts reached without completion");
  };
  
  const processFirstRecording = async (audioUri: string, mode: string) => {
    try {
      const convId = await createConversation(mode, "separate");
      await uploadAudio(convId, audioUri);
      return { success: true, id: convId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  };
  
  const processSeparateRecordings = async (
    partner1Uri: string,
    partner2Uri: string,
    updateProgress: (progress: number) => void,
    mode: string
  ) => {
    try {
      const conversationId = await createConversation(mode, "separate");
      await uploadAudio(conversationId, partner1Uri);
      await uploadAudio(conversationId, partner2Uri);
      const result = await pollForResult(conversationId, updateProgress);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  };
  
  const processLiveRecording = async (
    audioUri: string,
    updateProgress: (progress: number) => void,
    mode: string
  ) => {
    try {
      const conversationId = await createConversation(mode, "live");
      await uploadAudio(conversationId, audioUri);
      const result = await pollForResult(conversationId, updateProgress);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  };
  
  // Return all methods
  return {
    createConversation,
    uploadAudio,
    getConversationStatus,
    processFirstRecording,
    processSeparateRecordings,
    processLiveRecording,
    parseGptResponse,
    pollForResult,
    Token
  };
}