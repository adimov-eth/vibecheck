import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { saveAudioRecording } from '../utils/audioStorage';
import { showToast } from '../components/Toast';

export interface AudioRecordingHook {
  isRecording: boolean;
  isPermissionGranted: boolean;
  recordingStatus: string;
  startRecording: () => Promise<void>;
  stopRecording: (conversationId: string, partnerPrefix: string) => Promise<string | null>;
  releaseRecordings: () => Promise<void>;
  hasBeenReleased: boolean;
}

/**
 * Custom hook for managing audio recording functionality
 * Handles recording, saving, and releasing audio resources
 */
export function useAudioRecording(): AudioRecordingHook {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState<boolean>(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('');
  const [hasBeenReleased, setHasBeenReleased] = useState<boolean>(false);
  
  // Use refs for values that shouldn't trigger re-renders
  const savedRecordingsRef = useRef<Audio.Recording[]>([]);
  const hasBeenReleasedRef = useRef<boolean>(false);

  // Initialize on mount and handle cleanup
  useEffect(() => {
    (async () => {
      await requestPermissions();
    })();
    
    // Reset release flags on mount
    hasBeenReleasedRef.current = false;
    setHasBeenReleased(false);
    
    // Set release flags on unmount
    return () => {
      hasBeenReleasedRef.current = true;
      setHasBeenReleased(true);
    };
  }, []);

  /**
   * Request audio recording permissions from the user
   */
  const requestPermissions = async (): Promise<void> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === 'granted';
      setIsPermissionGranted(granted);
      
      if (granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } else {
        showToast.error('Permission Required', 'Audio recording permission is required.');
      }
    } catch (error: unknown) {
      const typedError = error as Error;
      console.error('Error requesting permissions:', typedError.message);
      showToast.error('Permission Error', 'Failed to request audio permissions.');
    }
  };

  /**
   * Start recording audio
   */
  const startRecording = async (): Promise<void> => {
    if (!isPermissionGranted) {
      await requestPermissions();
      if (!isPermissionGranted) return;
    }
    
    // Reset release flags when starting a new recording
    hasBeenReleasedRef.current = false;
    setHasBeenReleased(false);
    
    try {
      setRecordingStatus('Starting recording...');
      
      // Configure audio recording options for different platforms
      const options = {
        android: { 
          extension: '.wav', 
          outputFormat: Audio.AndroidOutputFormat.MPEG_4, 
          audioEncoder: Audio.AndroidAudioEncoder.AAC, 
          sampleRate: 16000, 
          numberOfChannels: 1, 
          bitRate: 64000 
        },
        ios: { 
          extension: '.m4a', 
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC, 
          audioQuality: Audio.IOSAudioQuality.LOW, 
          sampleRate: 24000, 
          numberOfChannels: 1, 
          bitRate: 64000, 
          linearPCMBitDepth: 16, 
          linearPCMIsBigEndian: false, 
          linearPCMIsFloat: false 
        },
        web: { 
          mimeType: 'audio/webm', 
          bitsPerSecond: 64000 
        },
      };
      
      const { recording: newRecording } = await Audio.Recording.createAsync(options);
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingStatus('Recording in progress...');
    } catch (error: unknown) {
      const typedError = error as Error;
      console.error('Failed to start recording:', typedError.message);
      showToast.error('Recording Error', 'Failed to start recording.');
    }
  };

  /**
   * Stop the current recording and save it
   * @param conversationId - ID of the conversation this recording belongs to
   * @param partnerPrefix - Prefix to identify which partner is speaking
   * @returns The URI of the saved recording, or null if saving failed
   */
  const stopRecording = async (
    conversationId: string, 
    partnerPrefix: string
  ): Promise<string | null> => {
    if (!recording) return null;
    
    try {
      setRecordingStatus('Stopping recording...');
      
      // Get URI before stopping
      const tempUri = recording.getURI();
      if (!tempUri) throw new Error('Recording URI is undefined');
      
      try {
        await recording.stopAndUnloadAsync();
        // Keep a reference to the recording for later cleanup
        savedRecordingsRef.current.push(recording);
      } catch (error: unknown) {
        const typedError = error as Error;
        console.log('Error stopping recording:', typedError.message);
      }
      
      // Save the recording to a permanent location
      const savedUri = await saveAudioRecording(tempUri, conversationId, partnerPrefix);
      
      // Reset recording state
      setRecording(null);
      setIsRecording(false);
      setRecordingStatus('');
      
      return savedUri;
    } catch (error: unknown) {
      const typedError = error as Error;
      console.error('Failed to stop recording:', typedError.message);
      showToast.error('Processing Error', 'Failed to process recording.');
      return null;
    }
  };

  /**
   * Release all recording resources to free memory
   * This should be called when recordings are no longer needed
   */
  const releaseRecordings = async (): Promise<void> => {
    // Prevent multiple release attempts
    if (hasBeenReleasedRef.current) {
      console.log('Recordings already released, skipping');
      return;
    }
    
    // Set flags immediately to prevent concurrent calls
    hasBeenReleasedRef.current = true;
    setHasBeenReleased(true);
    
    try {
      // Handle active recording if exists
      if (recording && isRecording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (error: unknown) {
          const typedError = error as Error;
          console.log('Recording already unloaded or in invalid state:', typedError.message);
        }
        setRecording(null);
        setIsRecording(false);
      }
      
      // Handle saved recordings
      const recordingsToRelease = [...savedRecordingsRef.current];
      savedRecordingsRef.current = []; // Clear immediately to prevent double-unload attempts
      
      // Process each saved recording
      for (const savedRecording of recordingsToRelease) {
        if (savedRecording) {
          try {
            const uri = savedRecording.getURI();
            if (uri) {
              await savedRecording.stopAndUnloadAsync();
            }
          } catch (error: unknown) {
            const typedError = error as Error;
            console.log('Saved recording already unloaded or invalid:', typedError.message);
          }
        }
      }
      
      console.log('All recordings successfully released');
    } catch (error: unknown) {
      const typedError = error as Error;
      console.error('Error releasing recordings:', typedError.message);
      // Still considered released even if errors occur
    }
  };

  return { 
    isRecording, 
    isPermissionGranted, 
    recordingStatus, 
    startRecording, 
    stopRecording,
    releaseRecordings,
    hasBeenReleased
  };
}