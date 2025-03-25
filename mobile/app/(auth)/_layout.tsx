import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  
  // Show loading state
  if (!isLoaded) {
    return null;
  }
  
  // Redirect to home if already signed in
  if (isSignedIn) {
    return <Redirect href="../home" />;
  }
  
  return <Stack />;
}