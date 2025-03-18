import React from 'react'

/**
 * Sign Up Screen
 * Handles user registration and email verification
 */
import { useState, useCallback } from 'react'
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native'
import { useSignUp } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import Button from '../../components/Button'
import { colors, typography, spacing } from '../styles'
import { SignUpState } from '../../types/auth'
import { FormField } from '../../components/auth/FormField'
import { PasswordInput } from '../../components/auth/PasswordInput'
import { ErrorMessage } from '../../components/auth/ErrorMessage'
import { validateEmail, validatePassword } from '../../utils/validation'

/**
 * Sign Up Screen Component
 * Provides user registration and email verification flow
 * @returns JSX Element for sign up screen
 */
export default function Page(): JSX.Element {
  const { isLoaded, signUp, setActive } = useSignUp()
  const router = useRouter()

  // Form state management using our SignUpState interface
  const [formState, setFormState] = useState<SignUpState>({
    emailAddress: '',
    password: '',
    pendingVerification: false,
    code: '',
    isLoading: false,
    error: ''
  })
  
  // Destructure form state for easier access
  const { emailAddress, password, pendingVerification, code, isLoading, error } = formState
  
  // Update form field helper
  const updateFormField = (field: keyof SignUpState, value: string | boolean): void => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      // Clear error when user makes changes
      error: ''
    }))
  }
  
  /**
   * Validate input before submission for registration
   * @returns Whether the form is valid
   */
  const validateRegistrationInput = useCallback((): boolean => {
    const emailValidation = validateEmail(emailAddress)
    
    if (!emailValidation.isValid) {
      setFormState(prev => ({ ...prev, error: emailValidation.errorMessage }))
      return false
    }
    
    const passwordValidation = validatePassword(password)
    
    if (!passwordValidation.isValid) {
      setFormState(prev => ({ ...prev, error: passwordValidation.errorMessage }))
      return false
    }
    
    return true
  }, [emailAddress, password])
  
  /**
   * Validate verification code
   * @returns Whether the code is valid
   */
  const validateVerificationInput = useCallback((): boolean => {
    if (!code || code.length < 6) {
      setFormState(prev => ({ ...prev, error: 'Please enter a valid verification code' }))
      return false
    }
    
    return true
  }, [code])

  /**
   * Handle user registration
   * Creates a new user account and prepares for email verification
   */
  const onSignUpPress = async (): Promise<void> => {
    if (!isLoaded || !validateRegistrationInput()) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Create the user account
      await signUp.create({
        emailAddress,
        password,
      })
      
      // Start email verification process
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      
      // Move to verification step
      updateFormField('pendingVerification', true)
    } catch (err) {
      console.error(JSON.stringify(err, null, 2))
      
      // Handle registration errors
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to create account. Please check your information and try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      updateFormField('isLoading', false)
    }
  }

  /**
   * Handle email verification code submission
   * Verifies the user's email address and completes signup
   */
  const onVerifyPress = async (): Promise<void> => {
    if (!isLoaded || !validateVerificationInput()) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Attempt to verify email with provided code
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      })
      
      // Handle successful verification
      if (signUpAttempt.status === 'complete') {
        // Set active session and navigate to home
        await setActive({ session: signUpAttempt.createdSessionId })
        router.replace('/')
      } else {
        // Handle incomplete verification
        console.error(JSON.stringify(signUpAttempt, null, 2))
        updateFormField('error', 'Verification incomplete. Please try again.')
      }
    } catch (err) {
      // Handle verification errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to verify code. Please check the code and try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      updateFormField('isLoading', false)
    }
  }

  /**
   * Handle resending verification code
   */
  const onResendCodePress = async (): Promise<void> => {
    if (!isLoaded || isLoading) return
    
    updateFormField('isLoading', true)
    
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      updateFormField('error', 'Verification code sent again. Please check your email.')
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to resend code. Please try again.'
      updateFormField('error', errorMessage)
    } finally {
      updateFormField('isLoading', false)
    }
  }

  return (
    <View style={styles.container}>
      {pendingVerification ? (
        // Verification screen
        <>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>Please enter the verification code sent to your email.</Text>
          
          <ErrorMessage message={error} />
          
          <FormField
            label="Verification Code"
            value={code}
            placeholder="Enter your verification code"
            onChangeText={(text: string) => updateFormField('code', text)}
            editable={!isLoading}
            keyboardType="number-pad"
          />
          
          <Button 
            title="Verify Email" 
            onPress={onVerifyPress} 
            variant="primary" 
            loading={isLoading}
            disabled={isLoading || code.length < 6}
            style={styles.button}
          />
          
          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Didn't receive a code?</Text>
            <TouchableOpacity onPress={onResendCodePress} disabled={isLoading}>
              <Text style={styles.actionLinkText}>Resend code</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.backLink} 
            onPress={() => updateFormField('pendingVerification', false)}
            disabled={isLoading}
          >
            <Text style={styles.backLinkText}>← Back to sign up</Text>
          </TouchableOpacity>
        </>
      ) : (
        // Registration screen
        <>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>
          
          <ErrorMessage message={error} />
          
          <FormField
            label="Email"
            value={emailAddress}
            onChangeText={(text: string) => updateFormField('emailAddress', text)}
            placeholder="Enter your email"
            editable={!isLoading}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <View style={styles.passwordContainer}>
            <PasswordInput
              value={password}
              onChangeText={(text: string) => updateFormField('password', text)}
              placeholder="Enter your password"
              editable={!isLoading}
            />
            <Text style={styles.passwordHint}>
              Password must include at least 8 characters with numbers, uppercase, and lowercase letters.
            </Text>
          </View>
          
          <Button 
            title="Sign Up" 
            onPress={onSignUpPress} 
            variant="primary" 
            loading={isLoading}
            disabled={isLoading || !emailAddress || !password}
            style={styles.button}
          />
          
          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Already have an account?</Text>
            <Link href="/(auth)/sign-in">
              <Text style={styles.actionLinkText}>Sign in</Text>
            </Link>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    backgroundColor: colors.background,
    justifyContent: 'center',
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
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  input: {
    ...typography.body1,
    color: colors.darkText,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    marginTop: spacing.sm,
  },
  passwordContainer: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  passwordHint: {
    ...typography.caption,
    color: colors.mediumText,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
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
  backLink: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    padding: spacing.xs,
  },
  backLinkText: {
    ...typography.body2,
    color: colors.mediumText,
  },
})