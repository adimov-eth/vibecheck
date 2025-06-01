import useStore from '@/state';
// Import AsyncStorage utilities for pending uploads
import { getPendingUploads, setPendingUploads } from '@/utils/background-upload';
import * as FileSystem from 'expo-file-system';
import { useCallback, useState } from 'react';

// Helper function to clear relevant Zustand store state
const clearZustandState = () => {
  console.log("[useClearCache:clearZustandState] Clearing Zustand state (conversations, messages, upload UI)...");
  useStore.getState().clearConversations();
  useStore.getState().clearMessages();
  // Clear upload UI state (progress, results)
  const conversations = Object.keys(useStore.getState().conversations);
  for (const conversationId of conversations) {
    useStore.getState().clearUploadState(conversationId);
  }
  // Also reset the entire maps to clear any orphaned entries
  useStore.setState({ uploadProgress: {}, uploadResults: {} });
  console.log("[useClearCache:clearZustandState] Zustand state cleared.");
};

// Helper function to clear upload results from state and delete associated files
const clearUploadArtifacts = async () => {
  console.log("[useClearCache:clearUploadArtifacts] Clearing upload results state and deleting associated files...");
  const uploadResults = { ...useStore.getState().uploadResults }; // Get a copy
  let deletedFilesCount = 0;
  const urisToDelete = Object.values(uploadResults)
    .map(result => result?.audioUri)
    .filter((uri): uri is string => !!uri); // Get valid URIs

  if (urisToDelete.length === 0) {
    console.log("[useClearCache:clearUploadArtifacts] No audio files found in uploadResults to delete.");
    return;
  }

  console.log(`[useClearCache:clearUploadArtifacts] Attempting deletion of ${urisToDelete.length} audio files.`);
  const deletePromises = urisToDelete.map(async (uri) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        return true; // Indicate success
      }
    } catch (deleteError) {
      console.warn(`[useClearCache:clearUploadArtifacts] Failed to delete specific audio file ${uri}:`, deleteError);
    }
    return false; // Indicate failure or file not found
  });

  const results = await Promise.allSettled(deletePromises);
  deletedFilesCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

  console.log(`[useClearCache:clearUploadArtifacts] Successfully deleted ${deletedFilesCount}/${urisToDelete.length} audio files.`);

  // Clear the uploadResults from the store AFTER attempting deletion
  useStore.setState({ uploadResults: {} });
};


// Helper function to clear pending uploads from AsyncStorage
const clearPendingUploadsStorage = async () => {
  console.log("[useClearCache:clearPendingUploadsStorage] Clearing pending background uploads from AsyncStorage...");
  const pending = await getPendingUploads();
  if (pending.length > 0) {
    await setPendingUploads([]); // Overwrite with empty array
    console.log(`[useClearCache:clearPendingUploadsStorage] Cleared ${pending.length} pending uploads from AsyncStorage.`);
  } else {
    console.log("[useClearCache:clearPendingUploadsStorage] No pending uploads found in AsyncStorage to clear.");
  }
};

// Helper function to clear Expo's cache directory
const clearExpoCacheDirectory = async () => {
  console.log("[useClearCache:clearExpoCacheDirectory] Attempting to clear contents of Expo FileSystem cache directory...");
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    console.warn("[useClearCache:clearExpoCacheDirectory] Could not determine cache directory. Skipping step.");
    return;
  }

  console.log(`[useClearCache:clearExpoCacheDirectory] Cache directory identified: ${cacheDir}`);
  try {
    const items = await FileSystem.readDirectoryAsync(cacheDir);
    if (items.length === 0) {
      console.log("[useClearCache:clearExpoCacheDirectory] Cache directory is empty. No items to delete.");
      return;
    }

    console.log(`[useClearCache:clearExpoCacheDirectory] Found ${items.length} items in cache directory. Deleting...`);
    let deletedCount = 0;
    const deletePromises = items.map(async (item) => {
      const itemPath = `${cacheDir}${item}`;
      try {
        await FileSystem.deleteAsync(itemPath, { idempotent: true });
        return true;
      } catch (itemDeleteError) {
        console.warn(`[useClearCache:clearExpoCacheDirectory] Failed to delete cache item: ${itemPath}`, itemDeleteError);
        return false;
      }
    });

    const results = await Promise.allSettled(deletePromises);
    deletedCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[useClearCache:clearExpoCacheDirectory] Deleted ${deletedCount}/${items.length} items from cache directory.`);

  } catch (readDirError) {
    const errorMsg = readDirError instanceof Error ? readDirError.message : String(readDirError);
    console.warn(`[useClearCache:clearExpoCacheDirectory] Could not clear cache directory contents: ${errorMsg}`);
  }
};

export const useClearCache = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearCache = useCallback(async () => {
    setIsClearing(true);
    setError(null);
    console.log("[useClearCache:clearCache] Starting cache clearing process...");

    try {
      // Execute clearing steps sequentially
      clearZustandState();
      await clearUploadArtifacts(); // Clear results state and delete files
      await clearPendingUploadsStorage();
      await clearExpoCacheDirectory();

      console.log("[useClearCache:clearCache] Cache clearing process finished successfully.");

    } catch (err) {
      // Catch errors primarily from AsyncStorage or unexpected issues
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useClearCache:clearCache] Critical error during cache clearing:', errorMessage);
      setError('Failed to clear essential cache data. Please try again.');
      // Note: Errors from file system operations are generally only warned in helpers
    } finally {
      setIsClearing(false);
    }
  }, []); // useCallback with empty dependency array

  return {
    clearCache,
    isClearing,
    error
  };
}; 