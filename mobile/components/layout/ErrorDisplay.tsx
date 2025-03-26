// components/ErrorDisplay.tsx
import { showToast } from '@/components/ui/Toast';
import useStore from '@/state';
import { ErrorMessage } from '@/state/types';
import React, { useEffect } from 'react';

const ErrorDisplay: React.FC = () => {
  const wsMessages = useStore((state) => state.wsMessages);
  const latestMessage = wsMessages[wsMessages.length - 1];
  const latestError = latestMessage?.type === 'error' ? (latestMessage as ErrorMessage).payload.error : null;

  useEffect(() => {
    if (latestError) {
      showToast.error('WebSocket Error', latestError);
    }
  }, [latestError]);

  return null; // No UI, just a listener
};

export default ErrorDisplay;