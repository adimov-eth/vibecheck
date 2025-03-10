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
  }

export function useAudioRecording(): AudioRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] = useState('');
  const isUnloadingRef = useRef(false);
  const savedRecordingsRef = useRef<Audio.Recording[]>([]);

  useEffect(() => {
    (async () => {
      await requestPermissions();
    })();
    
    // No automatic cleanup of recordings
    return () => {};
  }, []);

  const requestPermissions = async () => {
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
    } catch (error) {
      console.error('Error requesting permissions:', error);
      showToast.error('Permission Error', 'Failed to request audio permissions.');
    }
  };

  const startRecording = async () => {
    if (!isPermissionGranted) {
      await requestPermissions();
      if (!isPermissionGranted) return;
    }
    
    try {
      // Create a new recording without stopping the previous one
      // We'll keep previous recordings in memory until explicitly released
      setRecordingStatus('Starting recording...');
      const options = {
        android: { extension: '.wav', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 },
        ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.LOW, sampleRate: 24000, numberOfChannels: 1, bitRate: 64000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
        web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
      };
      const { recording: newRecording } = await Audio.Recording.createAsync(options);
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingStatus('Recording in progress...');
    } catch (error) {
      console.error('Failed to start recording:', error);
      showToast.error('Recording Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async (conversationId: string, partnerPrefix: string) => {
    if (!recording) return null;
    
    try {
      setRecordingStatus('Stopping recording...');
      
      // Get URI before stopping
      const tempUri = recording.getURI();
      if (!tempUri) throw new Error('Recording URI is undefined');
      
      // Stop recording but don't unload yet - just stop it
      try {
        await recording.stopAndUnloadAsync();
        // Keep a reference to the recording for later cleanup
        savedRecordingsRef.current.push(recording);
      } catch (error) {
        console.log('Error stopping recording:', error);
      }
      
      const savedUri = await saveAudioRecording(tempUri, conversationId, partnerPrefix);
      
      // Just reset the current recording, but don't unload it
      setRecording(null);
      setIsRecording(false);
      setRecordingStatus('');
      return savedUri;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      showToast.error('Processing Error', 'Failed to process recording.');
      return null;
    }
  };

  // New method to explicitly release all recordings
  const releaseRecordings = async () => {
    try {
      // If there's a current recording, stop it
      if (recording && isRecording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (err) {
          console.log('Error stopping current recording:', err);
        }
        setRecording(null);
        setIsRecording(false);
      }
      
      // Create a copy of the current saved recordings
      const recordingsToRelease = [...savedRecordingsRef.current];
      
      // Clear the saved recordings array immediately to prevent double-unload attempts
      savedRecordingsRef.current = [];
      
      // Unload all saved recordings
      for (const savedRecording of recordingsToRelease) {
        try {
          if (savedRecording) {
            // Check if the recording is in a state where it can be unloaded
            const uri = savedRecording.getURI();
            if (uri) {
              await savedRecording.stopAndUnloadAsync();
            }
          }
        } catch (err) {
          console.log('Error unloading saved recording:', err);
        }
      }
      
    } catch (error) {
      console.error('Error releasing recordings:', error);
    }
  };

  return { 
    isRecording, 
    isPermissionGranted, 
    recordingStatus, 
    startRecording, 
    stopRecording,
    releaseRecordings 
  };
}