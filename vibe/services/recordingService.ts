// /Users/adimov/Developer/final/vibe/services/recordingService.ts
import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS
} from 'expo-av';
import * as FileSystem from 'expo-file-system';

interface RecordingInstance {
recording: Audio.Recording;
uri: string | null;
}

let currentRecordingInstance: RecordingInstance | null = null;
let isCleaningUp = false;

export const checkPermissions = async (): Promise<boolean> => {
console.log("[RecordingService] Checking microphone permissions...");
try {
  const { status: currentStatus } = await Audio.getPermissionsAsync();
  if (currentStatus === 'granted') {
    console.log("[RecordingService] Microphone permission already granted.");
    return true;
  }
  console.log("[RecordingService] Requesting microphone permission...");
  const { status: newStatus } = await Audio.requestPermissionsAsync();
  console.log(`[RecordingService] Permission request result: ${newStatus}`);
  return newStatus === 'granted';
} catch (err) {
  console.error('[RecordingService] Permission check/request failed:', err);
  return false;
}
};

export const setupAudioMode = async (): Promise<void> => {
console.log("[RecordingService] Setting up audio mode...");
try {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  console.log("[RecordingService] Audio mode set successfully.");
} catch (err) {
  console.error('[RecordingService] Failed to set audio mode:', err);
  throw new Error('Failed to initialize audio recording session');
}
};

export const cleanupAudioMode = async (): Promise<void> => {
console.log("[RecordingService] Cleaning up audio mode...");
try {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
   console.log("[RecordingService] Audio mode cleaned up.");
} catch (err) {
  console.error('[RecordingService] Failed to cleanup audio mode:', err);
}
};

export const startRecording = async (): Promise<Audio.Recording> => {
console.log("[RecordingService] Attempting to start recording...");

if (isCleaningUp) {
    console.warn("[RecordingService] Start recording called while cleanup is in progress. Aborting.");
    throw new Error("Cleanup in progress, please wait.");
}

if (currentRecordingInstance) {
  console.warn("[RecordingService] Existing recording instance found. Cleaning up before starting new one.");
  await cleanupCurrentRecording();
  await new Promise(resolve => setTimeout(resolve, 100));
}

if (currentRecordingInstance) {
    console.error("[RecordingService] Failed to clear previous recording instance before starting new one.");
    throw new Error("Failed to cleanup previous recording.");
}

const hasPermission = await checkPermissions();
if (!hasPermission) {
  throw new Error('Microphone permission denied');
}

let recording: Audio.Recording | null = null;
try {
  console.log('[RecordingService] Creating and preparing new recording instance...');
  recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    android: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
      numberOfChannels: 1,
    },
    ios: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
      numberOfChannels: 1,
    }
  });
  console.log('[RecordingService] Recording prepared. Starting...');

  await recording.startAsync();
  console.log('[RecordingService] Recording started successfully.');

  currentRecordingInstance = { recording, uri: null };
  return recording;

} catch (err) {
  console.error('[RecordingService] Failed to start recording:', err);
  if (recording) {
      try {
          await recording.stopAndUnloadAsync();
      } catch (unloadErr) {
          console.warn('[RecordingService] Error unloading failed recording instance:', unloadErr);
      }
  }
  currentRecordingInstance = null;
  throw new Error(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`);
}
};

export const stopRecording = async (): Promise<string | null> => {
if (!currentRecordingInstance) {
  console.warn("[RecordingService] Stop called but no active recording instance found.");
  return null;
}
console.log("[RecordingService] Stopping recording...");

const instanceToStop = currentRecordingInstance;
currentRecordingInstance = null;
isCleaningUp = true;

try {
  await instanceToStop.recording.stopAndUnloadAsync();
  const uri = instanceToStop.recording.getURI();
  console.log(`[RecordingService] Recording stopped and unloaded. URI: ${uri}`);
  return uri;
} catch (err) {
  console.error('[RecordingService] Failed to stop or unload recording:', err);
  const potentialUri = instanceToStop.recording.getURI();
  if (potentialUri) {
      await cleanupFile(potentialUri);
  }
  return null;
} finally {
    isCleaningUp = false;
}
};

const cleanupFile = async (fileUri?: string): Promise<void> => {
  if (!fileUri) return;
  console.log(`[RecordingService:cleanupFile] Attempting to delete file: ${fileUri}`);
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      console.log(`[RecordingService:cleanupFile] Deleted file: ${fileUri}`);
    } else {
      console.log(`[RecordingService:cleanupFile] File not found for deletion: ${fileUri}`);
    }
  } catch (deleteErr) {
    console.error(`[RecordingService:cleanupFile] Failed to delete file ${fileUri}:`, deleteErr);
  }
};

export const cleanupCurrentRecording = async (fileUriToDelete?: string): Promise<void> => {
console.log(`[RecordingService] Cleanup requested. URI to delete: ${fileUriToDelete || 'None'}`);

if (isCleaningUp) {
    console.log("[RecordingService] Cleanup already in progress. Skipping redundant call.");
    return;
}
isCleaningUp = true;

const instanceToClean = currentRecordingInstance;
currentRecordingInstance = null;

if (instanceToClean) {
  console.log("[RecordingService] Cleaning up active/previous recording object...");
  try {
    // Infer status type from the async function return
    const status = await instanceToClean.recording.getStatusAsync();
    // Use status properties directly
    if (status.isRecording || status.canRecord) {
      await instanceToClean.recording.stopAndUnloadAsync();
      console.log("[RecordingService] Stopped and unloaded recording object.");
    }
  } catch (err) {
    console.warn('[RecordingService] Error stopping/unloading recording object during cleanup:', err);
    // @ts-ignore - Keep fallback internal cleanup attempt if needed
    if (typeof instanceToClean.recording._cleanupForUnloadedRecorder === 'function') {
      try {
         // @ts-ignore
        await instanceToClean.recording._cleanupForUnloadedRecorder();
        console.log("[RecordingService] Called internal recorder cleanup as fallback.");
      } catch (cleanupErr) {
         console.warn('[RecordingService] Error during fallback internal cleanup:', cleanupErr);
      }
    }
  }
}

await cleanupFile(fileUriToDelete);

console.log("[RecordingService] Cleanup finished.");
isCleaningUp = false;
};