import { animation, colors, layout, spacing } from '@/constants/styles';
import React from 'react';
import {
    AccessibilityRole,
    Animated,
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle
} from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  interactive?: boolean;
  padded?: boolean;
  variant?: 'default' | 'outline' | 'filled';
  elevation?: 'none' | 'small' | 'medium' | 'large';
  onPress?: () => void;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevated = true,
  interactive = false,
  padded = true,
  variant = 'default',
  elevation = 'small',
  onPress,
  testID,
}) => {
  // Animation value for press feedback
  const [pressAnim] = React.useState(() => new Animated.Value(0));
  const [hoverAnim] = React.useState(() => new Animated.Value(0));

  // Get variant-specific styles
  const getVariantStyles = () => {
    const variants = {
      default: {
        background: colors.surface,
        border: colors.border,
      },
      outline: {
        background: 'transparent',
        border: colors.border,
      },
      filled: {
        background: colors.surfaceActive,
        border: 'transparent',
      },
    };
    return variants[variant];
  };

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

  // Handle hover animations (for web)
  const handleHoverIn = () => {
    Animated.spring(hoverAnim, {
      toValue: 1,
      ...animation.springs.gentle,
      useNativeDriver: true,
    }).start();
  };

  const handleHoverOut = () => {
    Animated.spring(hoverAnim, {
      toValue: 0,
      ...animation.springs.gentle,
      useNativeDriver: true,
    }).start();
  };

  const scale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.98],
  });

  const elevation_Y = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  const variantStyles = getVariantStyles();
  const isInteractive = interactive || !!onPress;

  const CardWrapper = isInteractive ? Pressable : View;
  const wrapperProps = isInteractive ? {
    onPress,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
    onHoverIn: handleHoverIn,
    onHoverOut: handleHoverOut,
    accessibilityRole: 'button' as AccessibilityRole,
  } : {};

  return (
    <Animated.View
      style={[
        isInteractive && {
          transform: [
            { scale },
            { translateY: elevation_Y }
          ]
        }
      ]}
    >
      <CardWrapper
        {...wrapperProps}
        testID={testID}
      >
        <View
          style={[
            styles.card,
            padded && styles.padding,
            {
              backgroundColor: variantStyles.background,
              borderColor: variantStyles.border,
            },
            elevated && elevation !== 'none' && layout.shadows[elevation],
            style,
          ]}
        >
          {children}
        </View>
      </CardWrapper>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: layout.borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  padding: {
    padding: spacing.lg,
  },
}); 