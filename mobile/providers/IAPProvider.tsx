import { iapService } from '@/services/iap';
import React, { type ReactNode, useEffect } from 'react';

interface IAPProviderProps {
  children: ReactNode;
}

export function IAPProvider({ children }: IAPProviderProps) {
  useEffect(() => {
    // Initialize IAP service
    void iapService.initialize();

    // Cleanup on unmount
    return () => {
      iapService.cleanup();
    };
  }, []);

  return <>{children}</>;
} 