import { Stack } from "expo-router";
import React from "react";

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="home/index" />
      <Stack.Screen name="home/[id]" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/update-password" />
      <Stack.Screen name="recording" />
      <Stack.Screen name="results/[id]" />
      <Stack.Screen name="paywall" />
    </Stack>
  );
}