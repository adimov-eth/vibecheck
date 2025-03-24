import { useAuthStore } from '@/hooks/useTypedStore';
import { Redirect } from 'expo-router';
import React from 'react';

export default function Index() {
  const { isAuthenticated, tokenStatus } = useAuthStore();
  
  if (isAuthenticated && tokenStatus === 'valid') {
    return <Redirect href="/home" />;
  }
  
  return <Redirect href="/sign-in" />;
}