import { useAuthentication } from "@/hooks/useAuthentication";
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuthentication();
  
  if (isLoading) {
    return null;
  }
  
  if (isAuthenticated) {
    return <Redirect href="/(main)/home" />;
  }
  
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="authenticate" />
    </Stack>
  );
}