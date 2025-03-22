/**
 * Sign In Screen
 * Handles user authentication with email/password
 */
import { useState, useCallback } from 'react'
import { useSignIn } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, View, StyleSheet } from 'react-native'
import Button from '../../components/Button'
import { colors, typography, spacing } from '../styles'
import { SignInState } from '../../types/auth'
import { FormField } from '../../components/auth/FormField'
import { PasswordInput } from '../../components/auth/PasswordInput'
import { ErrorMessage } from '../../components/auth/ErrorMessage'
import { validateEmail } from '../../utils/validation'

/**
 * Sign In Page Component
 * Provides email/password authentication
 * @returns JSX Element for sign in screen
 */
export default function Page(): JSX.Element {
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()

  // Form state management using our SignInState interface
  const [formState, setFormState] = useState<SignInState>({
    emailAddress: '',
    password: '',
    isLoading: false,
    error: ''
  })
  
  // Destructure form state for easier access
  const { emailAddress, password, isLoading, error } = formState
  
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
        loading={isLoading}
        disabled={isLoading || !emailAddress || !password}
      />
      
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
    padding: spacing.xl,
    backgroundColor: colors.background,
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