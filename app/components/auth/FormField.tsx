/**
 * Form Field Component
 * A reusable component for form fields with label and validation
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
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
}: FormFieldProps): JSX.Element {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          error ? styles.inputError : null,
          !editable ? styles.inputDisabled : null,
          inputStyle
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.lightText}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        testID={testID}
      />
      
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
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
