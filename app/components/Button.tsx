// components/Button.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import { colors, typography, layout } from '../app/styles';

// Define the props interface for the Button component
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Define styles using StyleSheet.create for type safety
const styles = StyleSheet.create({
  buttonBase: {
    borderRadius: layout.borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...layout.cardShadow,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mediumButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  largeButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryText: {
    ...typography.buttonText,
    color: colors.white,
  },
  secondaryText: {
    ...typography.buttonText,
    color: colors.white,
  },
  outlineText: {
    ...typography.buttonText,
    color: colors.primary,
  },
  iconContainer: {
    marginRight: 8,
  },
});

const Button: React.FC<ButtonProps> = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style 
}) => {
  // Determine button style based on variant and size
  const getButtonStyle = () => {
    const variantStyle = 
      variant === 'primary' ? styles.primaryButton : 
      variant === 'secondary' ? styles.secondaryButton : 
      styles.outlineButton;
    
    const sizeStyle = 
      size === 'small' ? styles.smallButton : 
      size === 'large' ? styles.largeButton : 
      styles.mediumButton;
    
    return [
      styles.buttonBase,
      variantStyle,
      sizeStyle,
      disabled && styles.disabledButton,
    ];
  };

  // Determine text style based on variant
  const getTextStyle = () => {
    return variant === 'primary' ? styles.primaryText : 
           variant === 'secondary' ? styles.secondaryText : 
           styles.outlineText;
  };

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={style}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <View style={getButtonStyle()}>
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={variant === 'outline' ? colors.primary : colors.white} 
          />
        ) : (
          <>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text style={getTextStyle()}>{title}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default Button;