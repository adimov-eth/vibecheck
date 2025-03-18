/**
 * Sign In Screen
 * Handles user authentication with email/password and biometrics
 */
import { useState, useCallback } from 'react'
import { useSignIn } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, View, StyleSheet, Alert } from 'react-native'
import Button from '../../components/Button'
import { colors, typography, spacing } from '../styles'
import { SignInState } from '../../types/auth'
import { FormField } from '../../components/auth/FormField'
import { PasswordInput } from '../../components/auth/PasswordInput'
import { ErrorMessage } from '../../components/auth/ErrorMessage'
import { validateEmail } from '../../utils/validation'
import { useBiometrics } from '../../hooks/useBiometrics'

/**
 * Sign In Page Component
 * Provides email/password and biometric authentication
 * @returns JSX Element for sign in screen
 */
export default function Page(): JSX.Element {
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()
  const { 
    isBiometricsAvailable,
    isLoading: isBiometricsLoading,
    authenticateWithBiometrics,
    saveCredentials,
    getBiometricDisplayName
  } = useBiometrics()

  // Form state management using our SignInState interface
  const [formState, setFormState] = useState<SignInState>({
    emailAddress: '',
    password: '',
    isLoading: false,
    error: ''
  })
  
  // Destructure form state for easier access
  const { emailAddress, password, isLoading, error } = formState
  
  // Combined loading state for both form and biometrics
  const isProcessing = isLoading || isBiometricsLoading
  
  // Update form field helper
  const updateFormField = (field: keyof SignInState, value: string): void => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      // Clear error when user makes changes
      error: ''
    }))
  }

  /**
   * Handle sign in with email/password
   */
  const onSignInPress = async (): Promise<void> => {
    if (!isLoaded) return
    
    // Set loading state
    setFormState(prev => ({ ...prev, isLoading: true, error: '' }))

    try {
      // Attempt sign in with email/password
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      })

      // Handle successful authentication
      if (signInAttempt.status === 'complete') {
        // Store credentials for biometric login
        const credentialsSaved = await saveCredentials(emailAddress, password)
        if (!credentialsSaved) {
          console.warn('Failed to save credentials for biometric login')
          // Don't block the login flow for credential saving failures
        }
        
        // Set active session and navigate to home
        await setActive({ session: signInAttempt.createdSessionId })
        router.replace('/')
      } else {
        // Handle incomplete authentication
        console.error(JSON.stringify(signInAttempt, null, 2))
        setFormState(prev => ({
          ...prev, 
          error: 'Authentication incomplete. Please try again.'
        }))
      }
    } catch (err) {
      // Handle authentication errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to sign in. Please check your credentials and try again.'
      
      setFormState(prev => ({ ...prev, error: errorMessage }))
    } finally {
      // Reset loading state
      setFormState(prev => ({ ...prev, isLoading: false }))
    }
  }
  
  /**
   * Handle sign in with biometrics
   */
  const onBiometricSignInPress = async (): Promise<void> => {
    if (!isLoaded || !isBiometricsAvailable) return
    
    try {
      // Attempt biometric authentication with enhanced error handling
      const result = await authenticateWithBiometrics()
      
      if (result.success) {
        // No need to set active session or navigate - the hook handles it
        router.replace('/')
      } else if (result.errorMessage && result.shouldFallback) {
        // Show error and suggest fallback to password
        Alert.alert(
          'Biometric Authentication Failed',
          `${result.errorMessage}\n\nWould you like to use password login instead?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Use Password', 
              onPress: () => {
                // Just clear the error, let user use the form
                setFormState(prev => ({ ...prev, error: '' }))
              }
            }
          ]
        )
      } else if (result.errorMessage) {
        // Just show error in form
        setFormState(prev => ({ ...prev, error: result.errorMessage || 'Authentication failed' }))
      }
    } catch (err) {
      // Handle unexpected errors
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred. Please try again.'
      
      setFormState(prev => ({ ...prev, error: errorMessage }))
    }
  }

  /**
   * Validate input before submission
   * @returns Whether the form is valid
   */
  const validateInput = useCallback((): boolean => {
    const emailValidation = validateEmail(emailAddress);
    
    if (!emailValidation.isValid) {
      setFormState(prev => ({ ...prev, error: emailValidation.errorMessage }));
      return false;
    }
    
    if (!password) {
      setFormState(prev => ({ ...prev, error: 'Password is required' }));
      return false;
    }
    
    return true;
  }, [emailAddress, password]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>
      
      {/* Error message component */}
      <ErrorMessage message={error} />
      
      {/* Email input */}
      <FormField
        label="Email"
        value={emailAddress}
        onChangeText={(value: string) => updateFormField('emailAddress', value)}
        placeholder="Enter your email"
        editable={!isLoading}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      {/* Password input with toggle */}
      <View style={styles.passwordContainer}>
        <PasswordInput
          value={password}
          onChangeText={(value: string) => updateFormField('password', value)}
          placeholder="Enter your password"
          editable={!isLoading}
        />
        <Link href="/(auth)/forgot-password" style={styles.forgotPasswordLink}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </Link>
      </View>
      
      {/* Sign in button */}
      <Button 
        title="Sign In" 
        onPress={() => validateInput() && onSignInPress()} 
        variant="primary" 
        loading={isProcessing}
        disabled={isProcessing || !emailAddress || !password}
      />
      
      {/* Biometric authentication button */}
      {isBiometricsAvailable && (
        <Button
          title={`Sign in with ${getBiometricDisplayName()}`}
          onPress={onBiometricSignInPress}
          variant="secondary"
          loading={isProcessing}
          disabled={isProcessing}
          style={styles.biometricButton}
        />
      )}
      
      {/* Sign up link */}
      <View style={styles.linkContainer}>
        <Text style={styles.linkText}>Don't have an account?</Text>
        <Link href="/(auth)/sign-up">
          <Text style={styles.actionLinkText}>Sign up</Text>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl, // 20
    backgroundColor: colors.background, // #FCFDFE
  },
  title: {
    ...typography.heading1,
    color: colors.darkText,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body2,
    color: colors.mediumText,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  passwordContainer: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  forgotPasswordText: {
    ...typography.body2,
    color: colors.primary,
  },
  biometricButton: {
    marginTop: spacing.md,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  linkText: {
    ...typography.body2,
    color: colors.mediumText,
    marginRight: spacing.xs,
  },
  actionLinkText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: 'bold',
  },
})