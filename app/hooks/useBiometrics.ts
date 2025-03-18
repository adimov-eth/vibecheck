/**
 * Enhanced biometric authentication hook
 * Provides improved UX for biometric login with better error handling
 */
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { BiometricHook, BiometricResult } from '../types/auth';

/**
 * Enhanced hook for biometric authentication
 * Provides better UX and error handling for biometric login
 * @returns BiometricHook interface with biometric functions
 */
export function useBiometrics(): BiometricHook {
  const { 
    hasCredentials, 
    setCredentials, 
    authenticate, 
    biometricType, 
    clearCredentials 
  } = useLocalCredentials();
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const router = useRouter();
  const { signIn, setActive } = useSignIn();

  /**
   * Get user-friendly name for the biometric type
   * @returns User-friendly biometric type name
   */
  const getBiometricDisplayName = useCallback((): string => {
    if (!biometricType) return 'Biometric Login';
    
    // Return user-friendly names based on platform and biometric type
    if (biometricType === 'face-recognition') {
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
    }
    
    if (biometricType === 'fingerprint' || biometricType === 'touch-id') {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    }
    
    // Default fallback
    return 'Biometric Login';
  }, [biometricType]);

  /**
   * Prompt user for biometric authentication with enhanced error handling
   * @returns Promise resolving to authentication result
   */
  const authenticateWithBiometrics = useCallback(async (): Promise<BiometricResult> => {
    if (!hasCredentials || !biometricType) {
      setLastError('Biometric authentication not available');
      return { 
        success: false, 
        errorMessage: 'Biometric authentication not available', 
        shouldFallback: true 
      };
    }

    setIsLoading(true);
    setLastError(undefined);

    try {
      // Attempt biometric authentication
      const authResult = await authenticate();
      
      if (authResult.status === 'complete' && authResult.createdSessionId) {
        // Set active session on success
        if (setActive) {
          await setActive({ session: authResult.createdSessionId });
        }
        
        setIsLoading(false);
        return { success: true, shouldFallback: false };
      } else {
        // Handle incomplete authentication
        const errorMsg = 'Authentication incomplete. Please try again.';
        setLastError(errorMsg);
        
        setIsLoading(false);
        return { 
          success: false, 
          errorMessage: errorMsg, 
          shouldFallback: true 
        };
      }
    } catch (error) {
      // Parse and handle specific biometric errors
      const err = error as Error;
      let errorMessage = 'Authentication failed. Please try again.';
      let shouldFallback = true;
      
      // Handle known biometric error messages with user-friendly alternatives
      if (err.message?.includes('canceled')) {
        errorMessage = 'Authentication canceled';
        shouldFallback = false;
      } else if (err.message?.includes('lockout')) {
        errorMessage = 'Too many failed attempts. Please use your password.';
        shouldFallback = true;
      } else if (err.message?.includes('not available')) {
        errorMessage = 'Biometric authentication is not available on this device.';
        shouldFallback = true;
      } else if (err.message?.includes('not enrolled')) {
        errorMessage = 'Biometric authentication is not set up on this device.';
        shouldFallback = true;
      }
      
      setLastError(errorMessage);
      
      setIsLoading(false);
      return { 
        success: false, 
        errorMessage, 
        shouldFallback 
      };
    }
  }, [authenticate, hasCredentials, biometricType, setActive]);

  /**
   * Save user credentials for future biometric authentication
   * @param identifier - User identifier (email)
   * @param password - User password
   * @returns Promise resolving to success status
   */
  const saveCredentials = useCallback(async (
    identifier: string, 
    password: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setLastError(undefined);
    
    try {
      // Attempt to save credentials for biometric auth
      await setCredentials({ identifier, password });
      
      // Show success feedback only on first-time setup
      if (hasCredentials === false) {
        Alert.alert(
          'Biometric Login Enabled',
          `You can now sign in with ${getBiometricDisplayName()}`,
          [{ text: 'OK' }]
        );
      }
      
      setIsLoading(false);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to set up biometric login';
      
      setLastError(errorMessage);
      
      // Show error feedback
      Alert.alert(
        'Biometric Setup Failed',
        'Unable to enable biometric login. Please try again later.',
        [{ text: 'OK' }]
      );
      
      setIsLoading(false);
      return false;
    }
  }, [getBiometricDisplayName, hasCredentials, setCredentials]);

  /**
   * Remove stored biometric credentials
   * @returns Promise resolving to success status
   */
  const removeCredentials = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setLastError(undefined);
    
    try {
      // Clear stored credentials
      await clearCredentials();
      
      setIsLoading(false);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to remove biometric login';
      
      setLastError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [clearCredentials]);

  return {
    isBiometricsAvailable: Boolean(hasCredentials && biometricType),
    biometricType,
    isLoading,
    lastError,
    authenticateWithBiometrics,
    saveCredentials,
    removeCredentials,
    getBiometricDisplayName
  };
}
