import { Audio } from "expo-av";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import useStore from "../state/index";
import { useUsage } from "./useUsage";

interface UseRecordingFlowProps {
  modeId: string;
  onComplete: (conversationId: string) => void;
}

export const useRecordingFlow = ({ modeId, onComplete }: UseRecordingFlowProps) => {
  // Local state
  const [localId] = useState(uuidv4());
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState<1 | 2>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingObject, setRecordingObject] = useState<Audio.Recording | null>(null);

  const { checkCanCreateConversation } = useUsage();
  const store = useStore();

  // Toggle recording mode
  const handleToggleMode = (index: number) => {
    if (isRecording || isUploading) return;
    setRecordMode(index === 0 ? 'separate' : 'live');
    setRecordings([]);
    setCurrentPartner(1);
    setError(null);
  };

  // Start/stop recording
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording
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
      }
    } else {
      // Start recording
      try {
        const canCreate = await checkCanCreateConversation(false);
        if (!canCreate) {
          setError('Usage limit reached or subscription required');
          return;
        }

        if (recordings.length === 0) {
          await store.createConversation(modeId, recordMode, localId);
        }

        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') throw new Error('Permission denied');

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();
        setRecordingObject(recording);
        setIsRecording(true);
        setError(null);
      } catch (err) {
        setError('Failed to start recording');
        console.error(err);
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

  // Cleanup function
  const cleanup = async () => {
    if (recordingObject && isRecording) {
      await recordingObject.stopAndUnloadAsync();
    }
    setRecordingObject(null);
    setIsRecording(false);
  };

  return {
    recordMode,
    currentPartner,
    isRecording,
    isUploading,
    handleToggleMode,
    handleToggleRecording,
    error,
    cleanup,
    uploadProgress: store.uploadProgress[`${store.localToServerIds[localId]}_${recordMode === 'live' ? 'live' : currentPartner}`] || 0,
  };
}; 