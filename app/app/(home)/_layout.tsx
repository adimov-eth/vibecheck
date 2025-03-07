
import { Stack } from 'expo-router/stack'
import { useAuth } from '@clerk/clerk-expo'
import { Redirect } from 'expo-router'

export default function Layout() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />
  }

  return (
    <Stack screenOptions={{
      headerShown: false, // Hide all headers in the home group
    }} />
  )
}