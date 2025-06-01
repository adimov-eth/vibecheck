// /Users/adimov/Developer/final/vibe/hooks/useAuthentication.ts
import { clearAuthTokens, getAuthTokens } from '@/utils/auth';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
}

export function useAuthentication() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sign out function - clears tokens and navigates to auth screen
  const signOut = useCallback(async (options?: { redirect?: boolean }) => {
    const shouldRedirect = options?.redirect ?? true;
    console.log(`[useAuthentication] Signing out... Redirect: ${shouldRedirect}`);
    try {
      await clearAuthTokens();
      setIsAuthenticated(false);
      setUser(null);

      if (shouldRedirect) {
        // Navigate to the auth screen, replacing history
        router.replace('/(auth)/authenticate');
        console.log('[useAuthentication] Redirected to /authenticate');
      }
    } catch (error) {
      console.error('[useAuthentication] Error signing out:', error);
      // Even if clearing fails, update state and attempt redirect
      setIsAuthenticated(false);
      setUser(null);
      if (shouldRedirect) router.replace('/(auth)/authenticate');
      throw new Error('Failed to sign out completely');
    }
  }, [router]);


  // Check if user is authenticated based on stored tokens
  const checkAuthStatus = useCallback(async () => {
    console.log('[useAuthentication] Checking auth status...');
    try {
      setIsLoading(true);
      const tokens = await getAuthTokens();

      // Primary check: Do we have a user ID and *either* a session or identity token?
      const hasAuth = !!tokens.userId && (!!tokens.sessionToken || !!tokens.identityToken);
      setIsAuthenticated(hasAuth);
      console.log(`[useAuthentication] Auth status determined: ${hasAuth}`);

      if (hasAuth && tokens.userId) {
        setUser({
          id: tokens.userId,
          firstName: tokens.fullName?.givenName ?? null,
          lastName: tokens.fullName?.familyName ?? null,
          email: tokens.email,
        });
      } else {
        setUser(null);
        // If tokens exist but are somehow invalid (e.g., missing userId), clear them.
        if (tokens.sessionToken || tokens.identityToken) {
            console.warn('[useAuthentication] Found tokens but missing userId. Clearing inconsistent state.');
            await signOut({ redirect: false }); // Sign out without immediate redirect
        }
      }
    } catch (error) {
      console.error('[useAuthentication] Error checking authentication status:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('[useAuthentication] Auth check finished.');
    }
  }, [signOut]); // Added signOut dependency

  // Initialize authentication check on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return {
    isAuthenticated,
    isLoading,
    user,
    signOut, // Expose signOut for use in other hooks/components
    refreshAuthStatus: checkAuthStatus
  };
}