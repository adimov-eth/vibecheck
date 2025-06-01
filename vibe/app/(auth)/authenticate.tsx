// /Users/adimov/Developer/final/vibe/app/(auth)/authenticate.tsx
import { ErrorMessage } from '@/components/feedback/ErrorMessage';
import { AppleAuthButton } from '@/components/forms/AppleAuthButton';
import { Container } from '@/components/layout/Container';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, typography } from '@/constants/styles';
import { storeAuthTokens } from '@/utils/auth';
import type * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Updated backend response structure expectation
interface BackendAuthResponse {
    success: boolean;
    data?: {
        user: { id: string };
        sessionToken?: string; // Expect a session token from the backend
    };
    error?: string;
    code?: string;
}


export default function Authenticate() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAppleAuthSuccess = async (
    identityToken: string,
    userData: {
      userIdentifier: string;
      email?: string | null;
      fullName?: AppleAuthentication.AppleAuthenticationFullName | null;
    }
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('[Authenticate] Starting Apple backend authentication...');

      // Call backend API to authenticate with Apple
      const response = await fetch(`${API_URL}/users/apple-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // --- FIX: REMOVE Authorization header for this specific request ---
          // 'Authorization': `Bearer ${identityToken}`, // REMOVED
          // --- End Fix ---
        },
        body: JSON.stringify({
          // Send necessary user details obtained from Apple
          identityToken, // Send token in the body
          email: userData.email,
          fullName: userData.fullName,
        }),
      });

      const result = await response.json() as BackendAuthResponse;

      if (!response.ok || !result.success) {
          // Check for the specific EMAIL_ALREADY_EXISTS code
          if (result.code === 'EMAIL_ALREADY_EXISTS') {
              const specificMessage = result.error || "This email is already linked to another account.";
              console.warn(`[Authenticate] Email conflict: ${specificMessage}`);
              setError(specificMessage);
              showToast.error('Authentication Failed', specificMessage);
          } else {
              // Handle other errors
              const errorMessage = result.error || `Authentication failed on backend (Status: ${response.status})`;
              console.error(`[Authenticate] Backend auth failed: ${errorMessage}`);
              throw new Error(errorMessage);
          }
          setIsLoading(false);
          return; // Stop execution after handling error
      }

      // Ensure user ID and SESSION TOKEN exist on success
      const userId = result.data?.user?.id;
      const sessionToken = result.data?.sessionToken; // Get the session token

      if (!userId || !sessionToken) {
          console.error('[Authenticate] Backend success response missing user ID or session token.', result);
          throw new Error('Authentication succeeded but essential data was missing.');
      }
      console.log(`[Authenticate] Backend auth successful. UserID: ${userId}, SessionToken received.`);

      // Store authentication data including the SESSION TOKEN
      await storeAuthTokens({
        // identityToken, // Store identity token optionally, session token is primary now
        sessionToken: sessionToken, // Store the session token
        userId: userId,
        email: userData.email ?? undefined,
        fullName: userData.fullName ?? undefined,
      });
      console.log('[Authenticate] Auth tokens (including session token) stored.');

      // Handle successful authentication
      showToast.success('Success', 'Authentication successful');
      router.replace('/(main)/home');

    } catch (err) {
      console.error('[Authenticate] Apple authentication process error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      showToast.error('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleAuthError = (err: Error) => {
    // Ignore user cancellation
    if (err.message.includes('ERR_REQUEST_CANCELED') || err.message.includes('canceled')) {
        console.log('[Authenticate] Apple sign-in was canceled by the user.');
        return;
    }
    console.error('[Authenticate] Apple Authentication Library Error:', err);
    setError(err.message || 'An error occurred during Apple Sign-In.');
    showToast.error('Apple Sign-In Error', err.message || 'An unknown error occurred.');
  };

  return (
    <Container contentContainerStyle={styles.container}>
      <View style={styles.logoContainer}>
        {/* Add your app logo here */}
        <Text style={styles.appName}>VibeCheck</Text>
      </View>

      {isLoading && (
          <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Authenticating...</Text>
          </View>
      )}

      {error && !isLoading && <ErrorMessage message={error} />}

      <View style={styles.authContainer}>
        <AppleAuthButton
          title="Welcome to VibeCheck"
          subtitle="Sign in with your Apple ID to get started"
          buttonText="CONTINUE"
          onSuccess={handleAppleAuthSuccess}
          onError={handleAppleAuthError}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  appName: {
    ...typography.heading1,
    fontSize: 32,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  authContainer: {
    width: '100%',
    marginVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  footer: {
    marginTop: 'auto',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    ...typography.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body1,
    color: colors.text.secondary,
  },
});