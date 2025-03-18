/**
 * Biometric prompt component
 * Provides visual feedback for biometric authentication attempts
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBiometrics } from '../../hooks/useBiometrics';
import { colors, spacing, typography } from '../../app/styles';

interface BiometricPromptProps {
  /** Function to call when authentication is successful */
  onAuthSuccess: () => void;
  /** Function to call when authentication fails */
  onAuthFailure?: (errorMessage: string, shouldFallback: boolean) => void;
  /** Function to call when user cancels authentication */
  onCancel?: () => void;
  /** Whether to automatically attempt authentication on mount */
  autoPrompt?: boolean;
  /** Custom title for the prompt */
  title?: string;
  /** Custom description for the prompt */
  description?: string;
}

/**
 * Biometric authentication prompt component
 * Provides visual feedback for biometric authentication
 * @param props - BiometricPromptProps
 * @returns JSX Element for biometric prompt
 */
export function BiometricPrompt({
  onAuthSuccess,
  onAuthFailure,
  onCancel,
  autoPrompt = true,
  title,
  description,
}: BiometricPromptProps): JSX.Element {
  const { 
    isBiometricsAvailable, 
    getBiometricDisplayName, 
    authenticateWithBiometrics,
    isLoading,
    biometricType
  } = useBiometrics();
  
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempts, setAttempts] = useState<number>(0);
  const [showFallbackButton, setShowFallbackButton] = useState<boolean>(false);

  // Get the appropriate biometric icon
  const getBiometricIcon = (): string => {
    if (!biometricType) return 'finger-print';
    
    if (biometricType === 'face-recognition') {
      return 'scan-face';
    }
    
    return 'finger-print';
  };

  // Handle authentication attempt
  const handleAuthentication = async (): Promise<void> => {
    if (!isBiometricsAvailable || isLoading) return;
    
    setError(undefined);
    
    try {
      const result = await authenticateWithBiometrics();
      
      if (result.success) {
        onAuthSuccess();
      } else {
        setAttempts(prev => prev + 1);
        setError(result.errorMessage);
        
        // Show fallback button after multiple failures
        if (attempts >= 1 || result.shouldFallback) {
          setShowFallbackButton(true);
        }
        
        if (onAuthFailure) {
          onAuthFailure(
            result.errorMessage || 'Authentication failed', 
            result.shouldFallback
          );
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred';
      
      setError(errorMessage);
      setAttempts(prev => prev + 1);
      setShowFallbackButton(true);
      
      if (onAuthFailure) {
        onAuthFailure(errorMessage, true);
      }
    }
  };

  // Handle cancel button press
  const handleCancel = (): void => {
    if (onCancel) {
      onCancel();
    }
  };

  // Auto-prompt on mount if enabled
  useEffect(() => {
    if (autoPrompt && isBiometricsAvailable) {
      handleAuthentication();
    }
  }, []);

  if (!isBiometricsAvailable) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          Biometric authentication is not available on this device
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {title || `Sign in with ${getBiometricDisplayName()}`}
      </Text>
      
      <Text style={styles.description}>
        {description || `Use ${getBiometricDisplayName()} for quick and secure access`}
      </Text>
      
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      
      <TouchableOpacity 
        style={styles.iconContainer}
        onPress={handleAuthentication}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <Ionicons name={getBiometricIcon() as any} size={64} color={colors.primary} />
        )}
      </TouchableOpacity>
      
      <Text style={styles.tapText}>
        {isLoading ? 'Authenticating...' : 'Tap to authenticate'}
      </Text>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={styles.cancelButton} 
          onPress={handleCancel}
          disabled={isLoading}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        
        {showFallbackButton && (
          <TouchableOpacity 
            style={styles.fallbackButton}
            onPress={() => onAuthFailure?.('User requested fallback', true)}
          >
            <Text style={styles.fallbackText}>Use Password</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: spacing.xl,
    borderRadius: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 350,
  },
  title: {
    ...typography.heading3,
    color: colors.darkText,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  description: {
    ...typography.body2,
    color: colors.mediumText,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  tapText: {
    ...typography.body3,
    color: colors.mediumText,
    marginBottom: spacing.lg,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)', // Light red background
    padding: spacing.sm,
    borderRadius: spacing.xs,
    marginBottom: spacing.md,
    width: '100%',
  },
  error: {
    ...typography.body3,
    color: colors.error,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    width: '100%',
  },
  cancelButton: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body3,
    color: colors.mediumText,
  },
  fallbackButton: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
    backgroundColor: colors.cardBackground,
    minWidth: 100,
    alignItems: 'center',
  },
  fallbackText: {
    ...typography.body3,
    color: colors.primary,
  },
});
