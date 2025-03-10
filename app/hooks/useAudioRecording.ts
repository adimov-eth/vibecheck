import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { saveAudioRecording } from '../utils/audioStorage';
import { showToast } from '../components/Toast';


export interface AudioRecordingHook {
    isRecording: boolean;
    isPermissionGranted: boolean;
    recordingStatus: string;
    startRecording: () => Promise<void>;
    stopRecording: (conversationId: string, partnerPrefix: string) => Promise<string | null>;
  }

export function useAudioRecording(): AudioRecordingHook {
  const [isRecording, setIsRecording] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] = useState('');

  useEffect(() => {
    (async () => {
      await requestPermissions();
    })();
    return () => {
      if (recording) recording.stopAndUnloadAsync().catch(console.error);
    };
  }, [recording]);

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
      setRecordingStatus('Starting recording...');
      const options = {
        android: { extension: '.wav', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 },
        ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.LOW, sampleRate: 24000, numberOfChannels: 1, bitRate: 64000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
        web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
      };
      const { recording } = await Audio.Recording.createAsync(options);
      setRecording(recording);
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
      await recording.stopAndUnloadAsync();
      const tempUri = recording.getURI();
      if (!tempUri) throw new Error('Recording URI is undefined');
      const savedUri = await saveAudioRecording(tempUri, conversationId, partnerPrefix);
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

  return { isRecording, isPermissionGranted, recordingStatus, startRecording, stopRecording };
}