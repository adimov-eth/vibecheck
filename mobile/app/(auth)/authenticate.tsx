import { useState } from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { AppleAuthButton } from '@/components/forms/AppleAuthButton';
import { Container } from '@/components/layout/Container';
import { ErrorMessage } from '@/components/feedback/ErrorMessage';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, typography } from '@/constants/styles';
import * as SecureStore from 'expo-secure-store';

export default function Authenticate() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAppleAuthSuccess = async (token: string, userData?: any) => {
    try {
      setIsLoading(true);
      setError(null);

      // Call your backend API to authenticate with Apple
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/user/apple-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          identityToken: token,
          fullName: userData?.fullName
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Authentication failed');
      }
      
      // Store user data
      await SecureStore.setItemAsync('auth_token', token);
      await SecureStore.setItemAsync('user_id', result.data.user.id);
      
      // Handle successful authentication
      showToast.success('Success', 'Authentication successful');
      router.replace('/(main)/home');
    } catch (err) {
      console.error('Apple authentication error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      showToast.error('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleAuthError = (err: Error) => {
    if (err.message !== 'The operation was canceled.') {
      console.error('Apple authentication error:', err);
      setError(err.message);
      showToast.error('Error', err.message);
    }
  };

  return (
    <Container contentContainerStyle={styles.container}>
      <View style={styles.logoContainer}>
        {/* Add your app logo here */}
        <Text style={styles.appName}>VibeCheck</Text>
      </View>

      {error && <ErrorMessage message={error} />}

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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  appName: {
    ...typography.heading1,
    fontSize: 32,
    marginTop: spacing.md,
  },
  authContainer: {
    width: '100%',
    marginVertical: spacing.xxl,
  },
  footer: {
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.caption,
    color: colors.mediumText,
    textAlign: 'center',
  },
});