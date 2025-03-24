import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  style,
  testID,
}) => {
  // Determine colors based on variant
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: '#2563eb', text: '#ffffff' };
      case 'secondary':
        return { bg: '#64748b', text: '#ffffff' };
      case 'outline':
        return { bg: 'transparent', text: '#2563eb', border: '#2563eb' };
      case 'danger':
        return { bg: '#dc2626', text: '#ffffff' };
      default:
        return { bg: '#2563eb', text: '#ffffff' };
    }
  };

  // Determine padding based on size
  const getPadding = () => {
    switch (size) {
      case 'small': return { v: 8, h: 12 };
      case 'large': return { v: 16, h: 24 };
      default: return { v: 12, h: 16 };
    }
  };

  const colors = getColors();
  const padding = getPadding();
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.button,
        {
          backgroundColor: isDisabled ? '#d1d5db' : colors.bg,
          borderColor: colors.border || 'transparent',
          paddingVertical: padding.v,
          paddingHorizontal: padding.h,
          width: fullWidth ? '100%' : undefined,
        },
        variant === 'outline' && styles.outlineButton,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <View style={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'outline' ? colors.text : '#ffffff'} 
          />
        ) : (
          <>
            {leftIcon && (
              <Ionicons 
                name={leftIcon} 
                size={size === 'small' ? 16 : 20} 
                color={isDisabled ? '#9ca3af' : colors.text} 
                style={styles.leftIcon} 
              />
            )}
            <Text 
              style={[
                styles.buttonText, 
                {
                  color: isDisabled ? '#9ca3af' : colors.text,
                  fontSize: size === 'small' ? 14 : size === 'large' ? 18 : 16,
                }
              ]}
            >
              {title}
            </Text>
            {rightIcon && (
              <Ionicons 
                name={rightIcon} 
                size={size === 'small' ? 16 : 20} 
                color={isDisabled ? '#9ca3af' : colors.text} 
                style={styles.rightIcon} 
              />
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  outlineButton: {
    backgroundColor: 'transparent',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
}); 