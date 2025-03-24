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
      />
      <TouchableOpacity 
        style={[
          styles.toggleButton,
          { top: label ? 40 : 10 }
        ]} 
        onPress={toggleVisibility}
        disabled={disabled}
        accessibilityLabel={isVisible ? "Hide password" : "Show password"}
        accessibilityRole="button"
      >
        <Ionicons 
          name={isVisible ? "eye-off-outline" : "eye-outline"} 
          size={20} 
          color={disabled ? "#94a3b8" : "#64748b"} 
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  toggleButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
}); 