import { Audio } from "expo-av";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import useStore from "../state/index";
import { useUsage } from "./useUsage";

interface UseRecordingFlowProps {
  modeId: string;
  onComplete: (conversationId: string) => void;
}

export const useRecordingFlow = ({ modeId, onComplete }: UseRecordingFlowProps) => {
  // Local state
  const [localId] = useState(Crypto.randomUUID());
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState<1 | 2>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingObject, setRecordingObject] = useState<Audio.Recording | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Audio.PermissionStatus | null>(null);

  const { checkCanCreateConversation } = useUsage();
  const store = useStore();

  // Set up audio mode
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        console.error('Failed to set audio mode:', err);
        setError('Failed to initialize audio recording');
      }
    };

    setupAudio();

    // Cleanup audio mode on unmount
    return () => {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      }).catch(console.error);
    };
  }, []);

  // Check and request permissions
  const checkPermissions = async (): Promise<boolean> => {
    try {
      const { status: currentStatus } = await Audio.getPermissionsAsync();
      setPermissionStatus(currentStatus);
      
      if (currentStatus !== 'granted') {
        const { status: newStatus } = await Audio.requestPermissionsAsync();
        setPermissionStatus(newStatus);
        return newStatus === 'granted';
      }
      
      return true;
    } catch (err) {
      console.error('Permission check failed:', err);
      setError('Failed to check microphone permissions');
      return false;
    }
  };

  // Enhanced cleanup function
  const cleanup = async () => {
    try {
      if (recordingObject) {
        if (isRecording) {
          await recordingObject.stopAndUnloadAsync();
        }
        await recordingObject._cleanupForUnloadedRecorder();
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    } finally {
      setRecordingObject(null);
      setIsRecording(false);
      
      // Clean up any temporary recording files
      recordings.forEach(async (uri) => {
        try {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          }
        } catch (err) {
          console.error('Failed to delete recording file:', err);
        }
      });
      setRecordings([]);
    }
  };

  // Toggle recording mode
  const handleToggleMode = (index: number) => {
    if (isRecording || isUploading) return;
    setRecordMode(index === 0 ? 'separate' : 'live');
    setRecordings([]);
    setCurrentPartner(1);
    setError(null);
  };

  // Start/stop recording with enhanced error handling
  const handleToggleRecording = async () => {
    if (isRecording) {
      try {
        await recordingObject?.stopAndUnloadAsync();
        const uri = recordingObject?.getURI();
        if (!uri) throw new Error('Recording URI not found');
        setRecordings((prev) => [...prev, uri]);

        const audioKey = recordMode === 'live' ? 'live' : currentPartner.toString();
        store.addPendingUpload(localId, uri, audioKey);

        if (recordMode === 'separate' && currentPartner === 1) {
          setCurrentPartner(2);
        } else {
          setIsUploading(true);
          if (store.localToServerIds[localId]) {
            store.processPendingUploads(localId);
          }
        }
        setIsRecording(false);
        setRecordingObject(null);
      } catch (err) {
        setError('Failed to stop recording');
        console.error(err);
        await cleanup();
      }
    } else {
      try {
        const canCreate = await checkCanCreateConversation();
        if (!canCreate) {
          setError('Usage limit reached or subscription required');
          return;
        }

        const hasPermission = await checkPermissions();
        if (!hasPermission) {
          setError('Microphone permission denied');
          return;
        }

        if (recordings.length === 0) {
          await store.createConversation(modeId, recordMode, localId);
        }

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MAX,
          },
          keepAudioActiveHint: true,
        });
        await recording.startAsync();
        setRecordingObject(recording);
        setIsRecording(true);
        setError(null);
      } catch (err) {
        setError('Failed to start recording');
        console.error(err);
        await cleanup();
      }
    }
  };

  // Monitor upload completion
  useEffect(() => {
    const serverId = store.localToServerIds[localId];
    if (!serverId || !isUploading) return;

    const requiredUploads = recordMode === 'live' ? 1 : 2;
    const successfulUploads = Object.keys(store.uploadResults).filter((uploadId) => {
      return uploadId.startsWith(serverId) && store.uploadResults[uploadId]?.success;
    }).length;

    if (successfulUploads === requiredUploads) {
      onComplete(serverId);
    }
  }, [store.localToServerIds, store.uploadResults, localId, recordMode, isUploading, onComplete]);

  // Monitor permission changes
  useEffect(() => {
    const checkCurrentPermission = async () => {
      const { status } = await Audio.getPermissionsAsync();
      if (status !== permissionStatus) {
        setPermissionStatus(status);
        if (status !== 'granted' && isRecording) {
          setError('Microphone permission revoked');
          await cleanup();
        }
      }
    };

    // Only check permissions if we're recording
    if (isRecording) {
      const interval = setInterval(checkCurrentPermission, 1000);
      return () => clearInterval(interval);
    }
  }, [permissionStatus, isRecording]);

  // Cleanup on unmount - using useCallback to stabilize the cleanup function
  const stableCleanup = useCallback(async () => {
    await cleanup();
  }, []);

  useEffect(() => {
    return () => {
      stableCleanup().catch(console.error);
    };
  }, [stableCleanup]);

  return {
    recordMode,
    currentPartner,
    isRecording,
    isUploading,
    handleToggleMode,
    handleToggleRecording,
    error,
    cleanup: stableCleanup,
    uploadProgress: store.uploadProgress[`${store.localToServerIds[localId]}_${recordMode === 'live' ? 'live' : currentPartner}`] || 0,
  };
}; 