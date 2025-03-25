import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { FormField } from './FormField';

interface PasswordInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  helperText?: string;
  onBlur?: () => void;
  testID?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder = 'Enter password',
  error,
  disabled = false,
  helperText,
  onBlur,
  testID,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => setIsVisible(prev => !prev);

  return (
    <View style={styles.container} testID={testID}>
      <FormField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        error={error}
        secureTextEntry={!isVisible}
        disabled={disabled}
        helperText={helperText}
        onBlur={onBlur}
        inputStyle={styles.input}
      />
      <View style={styles.iconWrapper}>
        <TouchableOpacity 
          style={styles.toggleButton}
          onPress={toggleVisibility}
          disabled={disabled}
          accessibilityLabel={isVisible ? "Hide password" : "Show password"}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons 
            name={isVisible ? "eye-off" : "eye"}
            size={22}
            color={disabled ? "#94a3b8" : "#6b7280"}
            style={styles.icon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    paddingRight: 48,
  },
  iconWrapper: {
    position: 'absolute',
    top: 0,
    right: 6,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    // Account for label height when present
    marginTop: 8,
  },
  toggleButton: {
    height: 42,
    width: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
  },
  icon: {
    opacity: 0.6,
  },
}); 