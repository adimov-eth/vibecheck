import { animation, colors, layout, spacing, typography } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
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
  // Animation value for press feedback
  const [pressAnim] = React.useState(() => new Animated.Value(0));

  // Get variant-specific styles
  const getVariantStyles = () => {
    const variants = {
      primary: {
        background: colors.primary,
        text: colors.text.inverse,
        border: 'transparent',
        pressedBg: colors.primaryDark,
      },
      secondary: {
        background: colors.secondary,
        text: colors.text.inverse,
        border: 'transparent',
        pressedBg: colors.secondaryDark,
      },
      outline: {
        background: 'transparent',
        text: colors.primary,
        border: colors.primary,
        pressedBg: colors.background.secondary,
      },
      danger: {
        background: colors.error,
        text: colors.text.inverse,
        border: 'transparent',
        pressedBg: colors.errorLight,
      },
      ghost: {
        background: 'transparent',
        text: colors.text.secondary,
        border: 'transparent',
        pressedBg: colors.background.secondary,
      },
    };
    return variants[variant];
  };

  // Get size-specific styles
  const getSizeStyles = () => {
    const sizes = {
      small: {
        padding: spacing.sm,
        text: {
          ...typography.buttonSmall,
          fontWeight: '600' as const,
        },
        iconSize: 16,
      },
      medium: {
        padding: spacing.md,
        text: {
          ...typography.buttonMedium,
          fontWeight: '600' as const,
        },
        iconSize: 20,
      },
      large: {
        padding: spacing.lg,
        text: {
          ...typography.buttonLarge,
          fontWeight: '600' as const,
        },
        iconSize: 24,
      },
    };
    return sizes[size];
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  // Handle press animations
  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      ...animation.springs.gentle,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 0,
      ...animation.springs.gentle,
      useNativeDriver: true,
    }).start();
  };

  const scale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.98],
  });

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? variantStyles.pressedBg : variantStyles.background,
            borderColor: variantStyles.border,
            padding: sizeStyles.padding,
            opacity: disabled ? 0.5 : 1,
          },
          layout.shadows.small,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator 
              size="small" 
              color={variantStyles.text}
              style={styles.spinner} 
            />
          ) : (
            <>
              {leftIcon && (
                <Ionicons 
                  name={leftIcon} 
                  size={sizeStyles.iconSize} 
                  color={variantStyles.text} 
                  style={styles.leftIcon} 
                />
              )}
              <Text 
                style={[
                  sizeStyles.text,
                  { color: variantStyles.text },
                  styles.text,
                ]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {rightIcon && (
                <Ionicons 
                  name={rightIcon} 
                  size={sizeStyles.iconSize} 
                  color={variantStyles.text} 
                  style={styles.rightIcon} 
                />
              )}
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  button: {
    borderRadius: layout.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  leftIcon: {
    marginRight: spacing.xs,
  },
  rightIcon: {
    marginLeft: spacing.xs,
  },
  spinner: {
    marginHorizontal: spacing.xs,
  },
}); 