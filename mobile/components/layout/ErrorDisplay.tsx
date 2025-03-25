// components/ErrorDisplay.tsx
import { showToast } from '@/components/ui/Toast';
import useStore from '@/state';
import { useEffect } from 'react';

const ErrorDisplay = () => {
  const wsError = useStore((state) => state.error);

  useEffect(() => {
    if (wsError) {
      showToast.error('WebSocket Error', wsError);
      // Optional: Clear error after displaying
      // useStore.getState().setWsError(null);
    }
  }, [wsError]);

  return null; // No UI, just a listener
};

export default ErrorDisplay;