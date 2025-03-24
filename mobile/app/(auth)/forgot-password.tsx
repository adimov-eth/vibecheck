import { ErrorMessage } from '@/components/feedback/ErrorMessage';
import { FormField } from '@/components/forms/FormField';
import { PasswordInput } from '@/components/forms/PasswordInput';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/styles';
import { handleError } from '@/services/ErrorService';
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function ForgotPassword() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [successfulCreation, setSuccessfulCreation] = useState(false);
  const [secondFactor, setSecondFactor] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (signIn?.status === 'complete') {
      router.replace('/');
    }
  }, [signIn?.status, router]);

  if (!isLoaded) {
    return (
      <Container style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </Container>
    );
  }

  // Send the password reset code to the user's email
  const handleRequestCode = async () => {
    if (!signIn) {
      setError('Authentication is not initialized');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setSuccessfulCreation(true);
    } catch (err) {
      const error = handleError(err, {
        defaultMessage: 'Failed to send reset code',
        serviceName: 'ForgotPassword',
        errorType: 'AUTH_ERROR',
        severity: 'ERROR',
        metadata: { email }
      });
      console.error('error', error.message);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset the user's password
  const handleResetPassword = async () => {
    if (!signIn) {
      setError('Authentication is not initialized');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        // Set the active session
        await setActive({ session: result.createdSessionId });
        setError('');
        router.replace('/');
      } else if (result.status === 'needs_second_factor') {
        setSecondFactor(true);
        setError('');
      } else {
        console.log(result);
        const error = handleError(new Error('Invalid reset result'), {
          defaultMessage: 'Unexpected status: ' + result.status,
          serviceName: 'ForgotPassword',
          errorType: 'AUTH_ERROR',
          severity: 'ERROR',
          metadata: { status: result.status }
        });
        setError(error.message);
      }
    } catch (err) {
      const error = handleError(err, {
        defaultMessage: 'Failed to reset password',
        serviceName: 'ForgotPassword',
        errorType: 'AUTH_ERROR',
        severity: 'ERROR',
        metadata: { code }
      });
      console.error('error', error.message);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forgot Password?</Text>
      </View>

      <View style={styles.form}>
        {!successfulCreation ? (
          <>
            <FormField
              label="Provide your email address"
              value={email}
              onChangeText={setEmail}
              placeholder="e.g john@doe.com"
              keyboardType="email-address"
              autoCapitalize="none"
              disabled={isLoading}
            />

            <Button
              title="Send password reset code"
              variant="primary"
              onPress={handleRequestCode}
              loading={isLoading}
              disabled={isLoading || !email}
              style={styles.button}
            />
          </>
        ) : (
          <>
            <PasswordInput
              label="Enter your new password"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a new password"
              disabled={isLoading}
            />

            <FormField
              label="Enter the password reset code that was sent to your email"
              value={code}
              onChangeText={setCode}
              placeholder="Enter verification code"
              keyboardType="numeric"
              disabled={isLoading}
            />

            <Button
              title="Reset"
              variant="primary"
              onPress={handleResetPassword}
              loading={isLoading}
              disabled={isLoading || !code || !password}
              style={styles.button}
            />
          </>
        )}

        {error ? <ErrorMessage message={error} /> : null}
        {secondFactor && <Text style={styles.secondFactorText}>2FA is required, but this UI does not handle that</Text>}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Remember your password?</Text>
          <Link href="/(auth)/sign-in" style={styles.signInLink}>
            <Text style={styles.signInText}>Sign in</Text>
          </Link>
        </View>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.section,
    paddingBottom: spacing.section,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.heading1,
    marginBottom: spacing.xs,
  },
  form: {
    flex: 1,
  },
  loadingText: {
    ...typography.body1,
    textAlign: 'center',
  },
  secondFactorText: {
    ...typography.body2,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body2,
    color: colors.mediumText,
  },
  signInLink: {
    marginLeft: spacing.xs,
  },
  signInText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: '600',
  },
});