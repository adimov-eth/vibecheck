import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { AppleAuthButton } from "@/components/forms/AppleAuthButton";
import { Container } from "@/components/layout/Container";
import { showToast } from "@/components/ui/Toast";
import { colors, spacing, typography } from "@/constants/styles";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as SecureStore from 'expo-secure-store';

export default function SignIn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to VibeCheck</Text>
        <Text style={styles.subtitle}>Sign in with your Apple ID</Text>
      </View>

      {error && (
        <ErrorMessage 
          message={error} 
          testID="auth-error"
        />
      )}
      
      <AppleAuthButton
        title="Welcome back"
        subtitle="Sign in securely with your Apple ID"
        buttonText="CONTINUE"
        onSuccess={async (token, userData) => {
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
            showToast.success('Success', 'Signed in with Apple successfully');
            router.replace('/(main)/home');
          } catch (err) {
            console.error('Apple sign in error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate with Apple';
            setError(errorMessage);
            showToast.error('Error', errorMessage);
          } finally {
            setIsLoading(false);
          }
        }}
        onError={(err) => {
          if (err.message !== 'The operation was canceled.') {
            console.error('Apple sign in error:', err);
            setError(err.message);
            showToast.error('Error', err.message);
          }
        }}
      />

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
    paddingTop: spacing.section,
    paddingBottom: spacing.section,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.heading1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: "center",
  },
  footer: {
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.caption,
    color: colors.mediumText,
    textAlign: "center",
  },
});