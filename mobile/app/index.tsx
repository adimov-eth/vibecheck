import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import React from 'react';

export default function Index() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) {
    return <Redirect href="/home" />;
  }
  
  return <Redirect href="/sign-in" />;
}