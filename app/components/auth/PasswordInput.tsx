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
}: PasswordInputProps): JSX.Element {
  // Track password visibility state
  const [isVisible, setIsVisible] = useState<boolean>(false);
  
  // Toggle password visibility
  const toggleVisibility = (): void => setIsVisible(prev => !prev);
  
  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!isVisible}
        autoCapitalize="none"
        editable={editable}
        testID={testID}
      />
      <TouchableOpacity 
        onPress={toggleVisibility}
        style={styles.iconButton}
        accessibilityLabel={isVisible ? "Hide password" : "Show password"}
        accessibilityRole="button"
        disabled={!editable}
      >
        <Ionicons 
          name={isVisible ? "eye-off-outline" : "eye-outline"} 
          size={20} 
          color={editable ? colors.mediumText : colors.lightText} 
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
