import { Redirect } from "expo-router";
import { useAuth } from '@clerk/clerk-expo'

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth()
  
  // Wait for authentication to load
  if (!isLoaded) {
    return null
  }

  // Redirect based on authentication status
  if (isSignedIn) {
    return <Redirect href="/(home)" />
  } else {
    return <Redirect href="/sign-in" />
  }
}
