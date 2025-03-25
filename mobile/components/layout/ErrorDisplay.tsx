// components/ErrorDisplay.tsx
import { showToast } from '@/components/ui/Toast';
import useStore from '@/state';
import { useEffect } from 'react';

const ErrorDisplay = () => {
  const wsMessages = useStore((state) => state.wsMessages);
  const latestError = wsMessages[wsMessages.length - 1]?.type === 'error' ? wsMessages[wsMessages.length - 1].payload.error : null;

  useEffect(() => {
    if (latestError) {
      showToast.error('WebSocket Error', latestError);
    }
  }, [latestError]);

  return null; // No UI, just a listener
};

export default ErrorDisplay;