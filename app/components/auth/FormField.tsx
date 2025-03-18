/**
 * Form Field Component
 * A reusable component for form fields with label and validation
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, AccessibilityInfo } from 'react-native';
import { colors, typography, spacing } from '../../app/styles';

interface FormFieldProps {
  /** Field label text */
  label?: string;
  /** Current value of the field */
  value: string;
  /** Callback function when text changes */
  onChangeText: (text: string) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Error message to display (if any) */
  error?: string;
  /** Whether the input is editable */
  editable?: boolean;
  /** Keyboard type for the input */
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad';
  /** Whether the input is a password field (secureTextEntry) */
  secureTextEntry?: boolean;
  /** Auto capitalization behavior */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Optional instruction text below the field */
  helperText?: string;
  /** Custom style to apply to the container */
  containerStyle?: object;
  /** Custom style to apply to the input */
  inputStyle?: object;
  /** Whether this is a multiline input */
  multiline?: boolean;
  /** Number of lines to show (if multiline) */
  numberOfLines?: number;
  /** Callback for when the input is focused */
  onFocus?: () => void;
  /** Callback for when the input loses focus */
  onBlur?: () => void;
  /** Optional testID for testing */
  testID?: string;
  /** Validation function to run on blur */
  onValidate?: (value: string) => string | null;
  /** ID for accessibility purposes */
  accessibilityLabel?: string;
  /** Whether to auto-validate as the user types */
  validateOnChange?: boolean;
}

/**
 * Form field with label and validation
 * @param props - Component properties
 * @returns JSX.Element
 */
export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  editable = true,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'none',
  helperText,
  containerStyle,
  inputStyle,
  multiline = false,
  numberOfLines = 1,
  onFocus,
  onBlur,
  testID,
  onValidate,
  accessibilityLabel,
  validateOnChange = false,
}: FormFieldProps): JSX.Element {
  // Local state for inline validation
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  
  // Combine external and local validation errors
  const displayError = error || localError;
  
  // ID for linking label to input for accessibility
  const inputId = `input-${label?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString(36).substring(2, 9)}`;
  
  // Handle text changes with optional inline validation
  const handleTextChange = (text: string) => {
    onChangeText(text);
    
    // Clear local error when user types
    if (localError) {
      setLocalError(null);
    }
    
    // Validate as user types if enabled and we have a validation function
    if (validateOnChange && onValidate && text.length > 0) {
      const validationError = onValidate(text);
      if (validationError) {
        setLocalError(validationError);
      }
    }
  };
  
  // Handle blur with validation
  const handleBlur = (e: any) => {
    setIsFocused(false);
    
    // Run validation on blur if we have a validation function
    if (onValidate && value.length > 0) {
      const validationError = onValidate(value);
      setLocalError(validationError);
    }
    
    // Call external onBlur if provided
    if (onBlur) {
      onBlur();
    }
  };
  
  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    if (onFocus) {
      onFocus();
    }
  };
  
  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text 
          style={styles.label}
          nativeID={`${inputId}-label`}
          accessibilityRole="text"
        >
          {label}
        </Text>
      )}
      
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          displayError ? styles.inputError : null,
          isFocused && styles.inputFocused,
          !editable ? styles.inputDisabled : null,
          inputStyle
        ]}
        value={value}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        placeholderTextColor={colors.lightText}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
        testID={testID}
        accessibilityLabel={accessibilityLabel || label || placeholder}
        accessibilityHint={helperText}
        accessibilityState={{ 
          disabled: !editable,
          invalid: Boolean(displayError) 
        }}
        accessible={true}
        accessibilityLabelledBy={label ? `${inputId}-label` : undefined}
        nativeID={inputId}
        accessibilityRole="text"
      />
      
      {displayError ? (
        <Text 
          style={styles.errorText}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {displayError}
        </Text>
      ) : helperText ? (
        <Text 
          style={styles.helperText}
          accessibilityRole="text"
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    width: '100%',
  },
  label: {
    ...typography.body2,
    fontWeight: '600',
    color: colors.darkText,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body1,
    color: colors.darkText,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
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
  errorText: {
    ...typography.caption,
    color: colors.error || '#FF3B30',
    marginTop: spacing.xs / 2,
  },
  helperText: {
    ...typography.caption,
    color: colors.mediumText,
    marginTop: spacing.xs / 2,
  },
});
