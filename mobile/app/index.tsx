import { useAuthStore } from '@/hooks/useTypedStore';
import { Redirect } from 'expo-router';
import React from 'react';

export default function Index() {
  const { isAuthenticated } = useAuthStore();
  
  if (isAuthenticated) {
    return <Redirect href="/home" />;
  }
  
  return <Redirect href="/sign-in" />;
}