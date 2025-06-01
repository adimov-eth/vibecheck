import { useAuthentication } from "@/hooks/useAuthentication";
import { Redirect, Stack } from "expo-router";
import React, { useEffect, useState } from "react";

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuthentication();
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    if (authStatus === 'loading' && !isLoading) {
       if (isAuthenticated) {
           setAuthStatus('authenticated');
       } else {
           setAuthStatus('unauthenticated');
       }
    }
  }, [isLoading, isAuthenticated, authStatus]);

  if (authStatus === 'loading') {
    return null;
  }
  
  if (authStatus === 'unauthenticated') {
    return <Redirect href="/(auth)/authenticate" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="home/index" />
      <Stack.Screen name="home/[id]" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="recording" />
      <Stack.Screen name="results/[id]" />
      <Stack.Screen name="paywall" />
    </Stack>
  );
}