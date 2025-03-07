import { useAuth } from '@clerk/clerk-expo';

// Global token storage
let cachedToken: string | null = null;
let tokenExpiryTime: number | null = null;

// Function to set the token from components that have access to hooks
export function setAuthToken(token: string, expiryInMs: number = 3600000) {
  cachedToken = token;
  tokenExpiryTime = Date.now() + expiryInMs;
}

// Non-hook function to get the token that can be called from anywhere
export async function getAuthToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return cachedToken;
  }
  
  // If no token is available, throw an error
  throw new Error("No auth token available. Make sure you're logged in and the AuthTokenProvider is properly set up.");
}

// Hook to be used in components to manage the auth token
export function useAuthTokenManager() {
  const { getToken } = useAuth();
  
  // Function to refresh token that can be called from components
  const refreshToken = async () => {
    try {
      const token = await getToken();
      if (token) {
        setAuthToken(token);
        return token;
      }
      throw new Error("Failed to get token from Clerk");
    } catch (error) {
      console.error("Error refreshing auth token:", error);
      throw error;
    }
  };
  
  return { refreshToken };
}

// Custom hook to initialize token on component mount
export function useInitializeAuthToken() {
  const { refreshToken } = useAuthTokenManager();
  
  // This function should be called during component initialization
  const initialize = async () => {
    try {
      return await refreshToken();
    } catch (error) {
      console.error("Failed to initialize auth token:", error);
      return null;
    }
  };
  
  return { initialize };
}