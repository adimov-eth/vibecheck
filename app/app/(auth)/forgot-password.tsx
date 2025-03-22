import React from 'react'

/**
 * Forgot Password Screen
 * Handles password reset flow including email verification and new password creation
 */
import { useState, useCallback } from 'react'
import { useSignIn } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native'
import Button from '../../components/Button'
import { colors, typography, spacing } from '../styles'
import { FormField } from '../../components/auth/FormField'
import { PasswordInput } from '../../components/auth/PasswordInput'
import { ErrorMessage } from '../../components/auth/ErrorMessage'
import { validateEmail, validatePassword, validatePasswordMatch } from '../../utils/validation'
import { ForgotPasswordState } from '../../types/auth'

/**
 * Forgot Password Page Component
 * Provides a multi-step password reset flow:
 * 1. Request reset with email
 * 2. Verify email with code
 * 3. Set new password
 * @returns JSX Element for forgot password screen
 */
export default function ForgotPassword(): JSX.Element {
  const router = useRouter()
  const { signIn, isLoaded } = useSignIn()
  
  // Form state management with enhanced state interface
  const [formState, setFormState] = useState<ForgotPasswordState>({
    emailAddress: '',
    step: 'request',
    code: '',
    password: '',
    confirmPassword: '',
    isLoading: false,
    error: '',
    isSuccess: false
  })
  
  // Destructure form state for easier access
  const { 
    emailAddress, 
    step, 
    code, 
    password, 
    confirmPassword, 
    isLoading, 
    error, 
    isSuccess 
  } = formState
  
  // Update form field helper
  const updateFormField = <K extends keyof ForgotPasswordState>(
    field: K, 
    value: ForgotPasswordState[K]
  ): void => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      // Clear error when user makes changes
      error: ''
    }))
  }

  /**
   * Validate email input
   * @returns Whether the email is valid
   */
  const validateEmailInput = useCallback((): boolean => {
    const emailValidation = validateEmail(emailAddress)
    
    if (!emailValidation.isValid) {
      updateFormField('error', emailValidation.errorMessage)
      return false
    }
    
    return true
  }, [emailAddress])

  /**
   * Validate verification code
   * @returns Whether the code is valid
   */
  const validateCodeInput = useCallback((): boolean => {
    if (!code || code.length < 6) {
      updateFormField('error', 'Please enter a valid verification code')
      return false
    }
    
    return true
  }, [code])

  /**
   * Validate password input
   * @returns Whether the password is valid
   */
  const validatePasswordInput = useCallback((): boolean => {
    const passwordValidation = validatePassword(password)
    
    if (!passwordValidation.isValid) {
      updateFormField('error', passwordValidation.errorMessage)
      return false
    }
    
    const passwordMatchValidation = validatePasswordMatch(password, confirmPassword)
    
    if (!passwordMatchValidation.isValid) {
      updateFormField('error', passwordMatchValidation.errorMessage)
      return false
    }
    
    return true
  }, [password, confirmPassword])

  /**
   * Handle initial password reset request
   */
  const onRequestResetPress = async (): Promise<void> => {
    if (!isLoaded || !validateEmailInput()) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Create a reset password process
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress,
      })
      
      // Move to verification step
      updateFormField('step', 'verification')
    } catch (err) {
      // Handle errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to send reset email. Please try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      // Reset loading state
      updateFormField('isLoading', false)
    }
  }

  /**
   * Handle verification code submission
   */
  const onVerifyCodePress = async (): Promise<void> => {
    if (!isLoaded || !validateCodeInput()) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Prepare for reset with the verification code
      await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      })
      
      // Move to reset password step
      updateFormField('step', 'reset')
    } catch (err) {
      // Handle errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Invalid verification code. Please try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      // Reset loading state
      updateFormField('isLoading', false)
    }
  }

  /**
   * Handle password reset completion
   */
  const onResetPasswordPress = async (): Promise<void> => {
    if (!isLoaded || !validatePasswordInput()) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Reset the password
      await signIn.resetPassword({
        password,
      })
      
      // Mark as success
      updateFormField('isSuccess', true)
    } catch (err) {
      // Handle errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to reset password. Please try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      // Reset loading state
      updateFormField('isLoading', false)
    }
  }

  /**
   * Handle resending verification code
   */
  const onResendCodePress = async (): Promise<void> => {
    if (!isLoaded || isLoading) return
    
    // Set loading state
    updateFormField('isLoading', true)

    try {
      // Resend verification code
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress,
      })
      
      // Show success message
      updateFormField('error', 'Verification code sent again. Please check your email.')
    } catch (err) {
      // Handle errors
      console.error(JSON.stringify(err, null, 2))
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to resend verification code. Please try again.'
      
      updateFormField('error', errorMessage)
    } finally {
      // Reset loading state
      updateFormField('isLoading', false)
    }
  }

  // Show success message if password was reset
  if (isSuccess) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Password Reset</Text>
        <Text style={styles.message}>
          Your password has been successfully reset. You can now sign in with your new password.
        </Text>
        <Button
          title="Sign In"
          onPress={() => router.replace('/(auth)/sign-in')}
          variant="primary"
          style={styles.button}
        />
      </View>
    )
  }

  // Render appropriate step of the password reset flow
  return (
    <View style={styles.container}>
      {step === 'request' && (
        <>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>Enter your email to reset your password</Text>
          
          <ErrorMessage message={error} />
          
          <FormField
            label="Email"
            value={emailAddress}
            onChangeText={(value: string) => updateFormField('emailAddress', value)}
            placeholder="Enter your email"
            editable={!isLoading}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <Button 
            title="Send Reset Link" 
            onPress={onRequestResetPress}
            variant="primary" 
            loading={isLoading}
            disabled={isLoading || !emailAddress}
            style={styles.button}
          />
          
          <View style={styles.linkContainer}>
            <Text style={styles.linkText}>Remember your password?</Text>
            <Link href="/(auth)/sign-in">
              <Text style={styles.actionLinkText}>Sign in</Text>
            </Link>
          </View>
        </>
      )}

      {step === 'verification' && (
        <>
          <Text style={styles.title}>Verify Email</Text>
          <Text style={styles.subtitle}>Enter the verification code sent to {emailAddress}</Text>
          
          <ErrorMessage message={error} />
          
          <FormField
            label="Verification Code"
            value={code}
            onChangeText={(value: string) => updateFormField('code', value)}
            placeholder="Enter verification code"
            editable={!isLoading}
            keyboardType="number-pad"
          />
          
          <Button 
            title="Verify Code" 
            onPress={onVerifyCodePress}
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
            onPress={() => updateFormField('step', 'request')}
            disabled={isLoading}
          >
            <Text style={styles.backLinkText}>← Back to email entry</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'reset' && (
        <>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Create a new password for your account</Text>
          
          <ErrorMessage message={error} />
          
          <View style={styles.passwordContainer}>
            <PasswordInput
              value={password}
              onChangeText={(value: string) => updateFormField('password', value)}
              placeholder="Enter new password"
              editable={!isLoading}
            />
            <Text style={styles.passwordHint}>
              Password must include at least 8 characters with numbers, uppercase, and lowercase letters.
            </Text>
          </View>
          
          <View style={styles.passwordContainer}>
            <PasswordInput
              value={confirmPassword}
              onChangeText={(value: string) => updateFormField('confirmPassword', value)}
              placeholder="Confirm new password"
              editable={!isLoading}
            />
          </View>
          
          <Button 
            title="Reset Password" 
            onPress={onResetPasswordPress}
            variant="primary" 
            loading={isLoading}
            disabled={isLoading || !password || !confirmPassword}
            style={styles.button}
          />
          
          <TouchableOpacity 
            style={styles.backLink} 
            onPress={() => updateFormField('step', 'verification')}
            disabled={isLoading}
          >
            <Text style={styles.backLinkText}>← Back to verification</Text>
          </TouchableOpacity>
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
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  message: {
    ...typography.body1,
    color: colors.mediumText,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.sm,
  },
  passwordContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  passwordHint: {
    ...typography.caption,
    color: colors.mediumText,
    marginTop: spacing.xs,
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
