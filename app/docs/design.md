# VibeCheck Design System

## Table of Contents

1. [Introduction](#introduction)
2. [Design Principles](#design-principles)
3. [Color Palette](#color-palette)
4. [Typography](#typography)
5. [Spacing & Layout](#spacing--layout)
6. [Components](#components)
   - [Cards](#cards)
   - [Buttons](#buttons)
   - [Inputs](#inputs)
   - [Navigation](#navigation)
   - [Mode Selection UI](#mode-selection-ui)
   - [Audio Recording UI](#audio-recording-ui)
7. [Implementation Guide](#implementation-guide)
8. [Asset Management](#asset-management)

## Introduction

VibeCheck is a mobile application that serves as "an objective 3rd party to help you settle whatever needs settling." The app features multiple modes including Mediator, Who's Right, Dinner Planner, and Movie Night. This design system provides guidelines for implementing the UI components in React Native Expo.

## Design Principles

- **Clean and Minimal**: The design emphasizes clarity and simplicity with ample white space.
- **Card-Based Interface**: Content is organized into distinct card-like containers.
- **Subtle Gradients**: Used for emphasis and visual interest without overwhelming the interface.
- **Consistent Spacing**: Maintains uniform spacing patterns throughout the application.
- **Accessible Typography**: Font styles prioritize readability and hierarchy.

## Color Palette

### Primary Colors
```javascript
export const colors = {
  // Primary Brand Colors
  primary: '#2566FE',
  primaryLight: '#4C88FF',
  primaryDark: '#0F172A',
  
  // Mode Colors
  mediatorGreen: '#58BD7D',
  whosRightBlue: '#3B71FE',
  dinnerPlannerTeal: '#4BC9F0',
  movieNightOrange: '#FF6838',
  
  // Neutrals
  background: '#FCFDFE',
  cardBackground: '#FEFEFE',
  darkText: '#292D32',
  bodyText: '#64748B',
  subtleText: '#7C878E',
  border: '#E3E9EE',
  
  // Component Colors
  white: '#FFFFFF',
  divider: '#E3E9EE',
  toggle: '#F1F5F9',
  darkButton: '#353945',
  success: '#58BD7D',
};
```

### Gradients

```javascript
export const gradients = {
  primaryGradient: ['#5AAEF8', '#B490F8'],
  audioWaveGradient: ['#2566FE', '#C5D4FF'],
  buttonGradient: ['#2566FE', '#4C88FF'],
};
```

## Typography

Using Inter font family throughout the application:

```javascript
export const typography = {
  // Headings
  heading1: {
    fontFamily: 'Inter-Bold',
    fontSize: 32,
    lineHeight: 40, // 1.25em
    letterSpacing: -0.9, // -2.8%
    textAlign: 'center',
  },
  
  // Titles
  title1: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    lineHeight: 24, // 1.5em
    letterSpacing: 0,
  },
  
  // Body text
  body1: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 20, // 1.25em
  },
  
  body2: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20, // 1.4em
  },
  
  // Captions
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16, // 1.33em
  },
  
  // Small text
  small: {
    fontFamily: 'Inter-Regular',
    fontSize: 11.25,
    lineHeight: 16, // 1.42em
  },
  
  // Buttons
  buttonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    lineHeight: 24, // 1.7em
    letterSpacing: -0.14, // -1%
  },
  
  tabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    lineHeight: 20, // 1.43em
  },
  
  tabTextActive: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    lineHeight: 20, // 1.43em
  },
};
```

## Spacing & Layout

```javascript
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
};

export const layout = {
  screenPadding: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.section,
  },
  cardPadding: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingLeft: spacing.md, // When icon is present
  },
  gap: {
    small: spacing.sm,
    medium: spacing.md,
    large: spacing.xxl,
    section: spacing.xxxl,
  },
};
```

## Components

### Cards

Mode selection cards from the home screen:

```jsx
// ModeCard.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, layout } from '../styles';
import ModeIcon from './ModeIcon';

const ModeCard = ({ mode, title, description, isActive, onPress }) => {
  const cardStyles = [
    styles.card,
    isActive && styles.activeCard,
  ];
  
  return (
    <TouchableOpacity 
      style={cardStyles} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <ModeIcon mode={mode} />
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingRight: spacing.xxl,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  activeCard: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
    // Add shadow for active card
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOffset: { width: 0, height: 33 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  content: {
    flex: 1,
    marginLeft: spacing.xxl,
    gap: 4,
  },
  title: {
    ...typography.title1,
    color: colors.darkText,
  },
  description: {
    ...typography.small,
    color: colors.bodyText,
  },
});

export default ModeCard;
```

### ModeIcon Component

```jsx
// ModeIcon.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { colors, spacing } from '../styles';

const getIconConfig = (mode) => {
  switch (mode) {
    case 'mediator':
      return {
        color: colors.mediatorGreen,
        icon: (props) => (
          <Svg width="24" height="24" viewBox="0 0 24 24" {...props}>
            {/* SVG paths for mediator icon */}
            <Path d="M..." fill="white" />
          </Svg>
        ),
      };
    case 'whosRight':
      return {
        color: colors.whosRightBlue,
        icon: (props) => (
          <Svg width="24" height="24" viewBox="0 0 24 24" {...props}>
            {/* SVG paths for who's right icon */}
            <Path d="M..." fill="white" />
          </Svg>
        ),
      };
    // Add other mode icons
    default:
      return { color: colors.primary };
  }
};

const ModeIcon = ({ mode }) => {
  const { color, icon: Icon } = getIconConfig(mode);
  
  return (
    <View style={[styles.iconContainer, { backgroundColor: color }]}>
      {Icon && <Icon />}
    </View>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
});

export default ModeIcon;
```

### Buttons

```jsx
// Button.js
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing } from '../styles';

const Button = ({ 
  title, 
  onPress, 
  variant = 'primary', // primary, secondary, text
  size = 'medium', // small, medium, large
  isLoading = false,
  disabled = false,
  icon = null,
}) => {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isText = variant === 'text';
  
  const buttonStyles = [
    styles.button,
    styles[`${size}Button`],
    isSecondary && styles.secondaryButton,
    isText && styles.textButton,
    disabled && styles.disabledButton,
  ];
  
  const textStyles = [
    styles.text,
    styles[`${size}Text`],
    isSecondary && styles.secondaryText,
    isText && styles.textOnlyText,
    disabled && styles.disabledText,
  ];
  
  if (isLoading) {
    return (
      <TouchableOpacity style={buttonStyles} disabled>
        <ActivityIndicator color={isPrimary ? 'white' : colors.primary} />
      </TouchableOpacity>
    );
  }
  
  if (isPrimary) {
    return (
      <TouchableOpacity
        onPress={disabled ? null : onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={disabled ? ['#A0A0A0', '#C0C0C0'] : [colors.primary, colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={buttonStyles}
        >
          {icon && icon}
          <Text style={textStyles}>{title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  
  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={disabled ? null : onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon && icon}
      <Text style={textStyles}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  smallButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 32,
  },
  mediumButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  largeButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    minHeight: 56,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  textButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
  },
  disabledButton: {
    opacity: 0.6,
  },
  text: {
    ...typography.buttonText,
    color: colors.white,
    marginLeft: spacing.sm,
  },
  smallText: {
    fontSize: 12,
  },
  mediumText: {
    fontSize: 14,
  },
  largeText: {
    fontSize: 16,
  },
  secondaryText: {
    color: colors.primary,
  },
  textOnlyText: {
    color: colors.primary,
  },
  disabledText: {
    color: colors.subtleText,
  },
});

export default Button;
```

### Toggle Component

```jsx
// Toggle.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../styles';

const Toggle = ({ options, selectedIndex, onToggle }) => {
  return (
    <View style={styles.container}>
      {options.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.toggleItem,
            selectedIndex === index && styles.selectedItem,
          ]}
          onPress={() => onToggle(index)}
        >
          <Text
            style={[
              styles.toggleText,
              selectedIndex === index && styles.selectedText,
            ]}
          >
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.toggle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    width: '100%',
  },
  toggleItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedItem: {
    backgroundColor: colors.white,
    // Add shadow
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  toggleText: {
    ...typography.buttonText,
    color: colors.darkText,
  },
  selectedText: {
    color: colors.primaryDark,
  },
});

export default Toggle;
```

### Audio Recording UI

```jsx
// AudioRecordButton.js
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import { colors } from '../styles';

const AudioRecordButton = ({ 
  isRecording, 
  onPressIn, 
  onPressOut, 
  size = 80 
}) => {
  // Animated values for the ripple effect
  const rippleScale = React.useRef(new Animated.Value(1)).current;
  const rippleOpacity = React.useRef(new Animated.Value(0.2)).current;
  
  React.useEffect(() => {
    if (isRecording) {
      // Start ripple animation when recording
      Animated.loop(
        Animated.parallel([
          Animated.timing(rippleScale, {
            toValue: 1.5,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(rippleOpacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Reset animations
      rippleScale.setValue(1);
      rippleOpacity.setValue(0.2);
    }
  }, [isRecording]);
  
  return (
    <View style={styles.container}>
      {/* Ripple effect */}
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 1.5 / 2,
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          },
        ]}
      />
      
      {/* Button background */}
      <LinearGradient
        colors={[colors.white, colors.primary]} 
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.gradient, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <TouchableOpacity
          style={[styles.button, { width: size - 2, height: size - 2, borderRadius: (size - 2) / 2 }]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={0.8}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z"
              stroke="#230B34"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M4.35 9.65V11.35C4.35 15.57 7.78 19 12 19C16.22 19 19.65 15.57 19.65 11.35V9.65"
              stroke="#230B34"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    backgroundColor: colors.primary,
    opacity: 0.2,
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
  },
  button: {
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AudioRecordButton;
```

### Audio Visualization

```jsx
// AudioWaveform.js
import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../styles';

const AudioWaveform = ({ isActive, audioData = [] }) => {
  // Use sample data if audioData is empty
  const sampleData = [0.2, 0.5, 0.3, 0.8, 0.4, 0.6, 0.7, 0.3, 0.5, 0.9];
  const data = audioData.length > 0 ? audioData : sampleData;
  
  // Animation for active state
  const barHeight = React.useRef(data.map(() => new Animated.Value(0.1))).current;
  
  React.useEffect(() => {
    if (isActive) {
      // Animate each bar
      const animations = data.map((value, index) => {
        return Animated.sequence([
          Animated.timing(barHeight[index], {
            toValue: value,
            duration: 500 + Math.random() * 500,
            useNativeDriver: false,
          }),
          Animated.timing(barHeight[index], {
            toValue: 0.1 + Math.random() * 0.2,
            duration: 500 + Math.random() * 500,
            useNativeDriver: false,
          })
        ]);
      });
      
      Animated.loop(
        Animated.stagger(100, animations)
      ).start();
    } else {
      // Reset to base state
      data.forEach((_, index) => {
        barHeight[index].setValue(0.1 + (data[index] * 0.3));
      });
    }
  }, [isActive]);
  
  return (
    <View style={styles.container}>
      {data.map((_, index) => (
        <Animated.View 
          key={index}
          style={[
            styles.bar,
            { height: barHeight[index].interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%']
              })
            }
          ]}
        >
          <LinearGradient
            colors={[colors.primaryLight, colors.primary]}
            style={styles.gradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    width: '100%',
    paddingHorizontal: 16,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    opacity: 0.7,
  },
  gradient: {
    flex: 1,
    width: '100%',
  }
});

export default AudioWaveform;
```

## Implementation Guide

1. **Setup Font Assets:**
   - Install the Inter font family using Expo:
   ```bash
   expo install expo-font @expo-google-fonts/inter
   ```

2. **Configure Theme Provider:**
   - Create a theme context to provide design system values throughout the app.
   
3. **Component Structure:**
   - Organize components in a modular structure:
     - `/components/common` - Reusable UI elements
     - `/components/modes` - Mode-specific components
     - `/components/audio` - Audio recording related components

4. **Navigation Setup:**
   - Use React Navigation with a tab navigator for main screens
   - Create a stack navigator for the recording flows

5. **Audio Recording Integration:**
   - Utilize Expo AV for audio recording:
   ```bash
   expo install expo-av
   ```
   - Implement audio recording and playback functionality
   - Connect the AudioRecordButton and AudioWaveform components

## Asset Management

1. **SVG Icons:**
   - Use `react-native-svg` for all icons
   - Create an icon registry component for easy access

2. **Gradients:**
   - Use `expo-linear-gradient` for all gradient effects

3. **Animations:**
   - Use React Native's Animated API for simple animations
   - Consider `react-native-reanimated` for complex interactions

4. **Shadows:**
   - On iOS, use shadowProps
   - On Android, use elevation
   - Consider a cross-platform solution like `react-native-shadow`
