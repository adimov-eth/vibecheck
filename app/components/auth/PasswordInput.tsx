/**
 * Password Input Component
 * A reusable component for password fields with visibility toggle
 */
import React, { useState } from 'react';
import { TextInput, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../app/styles';

interface PasswordInputProps {
  /** Current value of the password field */
  value: string;
  /** Callback function when text changes */
  onChangeText: (text: string) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the input is editable */
  editable?: boolean;
  /** Custom style to apply to the input container */
  containerStyle?: object;
  /** Custom style to apply to the input itself */
  inputStyle?: object;
  /** Optional testID for testing */
  testID?: string;
  /** Error message to display (if any) */
  error?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Callback for when the input is focused */
  onFocus?: () => void;
  /** Callback for when the input loses focus */
  onBlur?: () => void;
  /** Validation function to run on blur */
  onValidate?: (value: string) => string | null;
  /** Whether to auto-validate as the user types */
  validateOnChange?: boolean;
}

/**
 * Password input with visibility toggle
 * @param props - Component properties
 * @returns JSX.Element
 */
export function PasswordInput({
  value,
  onChangeText,
  placeholder = "Enter password",
  editable = true,
  containerStyle,
  inputStyle,
  testID,
  error,
  accessibilityLabel,
  onFocus,
  onBlur,
  onValidate,
  validateOnChange = false,
}: PasswordInputProps): JSX.Element {
  // Track password visibility state
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  
  // Combine external and local errors
  const displayError = error || localError;
  
  // Generate unique ID for accessibility
  const inputId = `password-input-${Math.random().toString(36).substring(2, 9)}`;
  
  // Toggle password visibility
  const toggleVisibility = (): void => setIsVisible(prev => !prev);
  
  // Handle text changes with validation
  const handleTextChange = (text: string) => {
    onChangeText(text);
    
    // Clear local error when user types
    if (localError) {
      setLocalError(null);
    }
    
    // Validate as user types if enabled
    if (validateOnChange && onValidate && text.length > 0) {
      const validationError = onValidate(text);
      if (validationError) {
        setLocalError(validationError);
      }
    }
  };
  
  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    if (onFocus) {
      onFocus();
    }
  };
  
  // Handle blur with validation
  const handleBlur = () => {
    setIsFocused(false);
    
    // Run validation on blur
    if (onValidate && value.length > 0) {
      const validationError = onValidate(value);
      setLocalError(validationError);
    }
    
    if (onBlur) {
      onBlur();
    }
  };
  
  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        style={[
          styles.input, 
          displayError ? styles.inputError : null,
          isFocused && styles.inputFocused,
          !editable ? styles.inputDisabled : null,
          inputStyle
        ]}
        value={value}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        placeholderTextColor={colors.lightText}
        secureTextEntry={!isVisible}
        autoCapitalize="none"
        editable={editable}
        testID={testID}
        onFocus={handleFocus}
        onBlur={handleBlur}
        nativeID={inputId}
        accessibilityLabel={accessibilityLabel || placeholder}
        accessibilityHint="Password field with visibility toggle"
        accessibilityState={{ 
          disabled: !editable
        }}
        importantForAccessibility="yes"
      />
      <TouchableOpacity 
        onPress={toggleVisibility}
        style={styles.iconButton}
        accessibilityLabel={isVisible ? "Hide password" : "Show password"}
        accessibilityRole="button"
        accessibilityHint={isVisible ? "Hide password text" : "Show password text"}
        accessibilityState={{ disabled: !editable }}
        disabled={!editable}
        importantForAccessibility="yes"
      >
        <Ionicons 
          name={isVisible ? "eye-off-outline" : "eye-outline"} 
          size={20} 
          color={editable ? colors.mediumText : colors.lightText} 
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    marginBottom: spacing.md,
  },
  input: {
    ...typography.body1,
    color: colors.darkText,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    paddingRight: spacing.xl + spacing.md, // Extra space for the icon
  },
  inputError: {
    borderColor: colors.error || '#FF3B30',
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  inputDisabled: {
    backgroundColor: '#F8F8F8',
    color: colors.mediumText,
  },
  iconButton: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  }
});
