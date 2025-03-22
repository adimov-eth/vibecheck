import React, { useState } from 'react';
import { View, Button, Text } from 'react-native';
import { Audio } from 'expo-av';
import { addToUploadQueue, getUploadQueueStatus } from '../utils/backgroundUpload';
import { useApi } from '../hooks/useAPI';
import { handleApiError } from '../utils/errorHandler';

const RecordingScreen = () => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  
  const { createConversation } = useApi();
  
  // Check pending uploads on mount
  React.useEffect(() => {
    const checkPendingUploads = async () => {
      const status = await getUploadQueueStatus();
      setPendingUploads(status.pendingCount);
    };
    
    checkPendingUploads();
    
    // Set up interval to check periodically
    const interval = setInterval(checkPendingUploads, 10000);
    return () => clearInterval(interval);
  }, []);
  
  // Start recording function
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      
      setRecording(recording);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };
  
  // Stop recording function
  const stopRecording = async () => {
    if (!recording) return;
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordingUri(uri);
      setRecording(null);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };
  
  // Queue upload for background processing
  const queueUpload = async () => {
    if (!recordingUri) return;
    
    setUploading(true);
    
    try {
      // First create a conversation
      const conversationId = await createConversation('123', 'normal', 'separate');
      
      // Add recording to upload queue
      await addToUploadQueue(conversationId, recordingUri, {
        timestamp: new Date().toISOString(),
        type: 'primary_audio'
      });
      
      // Update pending uploads count
      const status = await getUploadQueueStatus();
      setPendingUploads(status.pendingCount);
      
      // Reset recording URI
      setRecordingUri(null);
      
    } catch (error) {
      handleApiError(error, {
        customMessages: {
          network: 'Unable to prepare upload. Your recording has been saved and will be uploaded when connection is restored.'
        }
      });
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <View>
      <Text>Pending uploads: {pendingUploads}</Text>
      
      {!recording ? (
        <Button title="Start Recording" onPress={startRecording} />
      ) : (
        <Button title="Stop Recording" onPress={stopRecording} />
      )}
      
      {recordingUri && (
        <Button 
          title={uploading ? "Preparing Upload..." : "Upload Recording"} 
          onPress={queueUpload}
          disabled={uploading}
        />
      )}
    </View>
  );
};

export default RecordingScreen; 