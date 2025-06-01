import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Function to calculate responsive sizes
const scale = (size: number): number => (screenWidth / 375) * size;

// Color system
export const colors = {
  // Brand colors
  primary: '#5B86E5',
  primaryLight: '#EEF4FF',
  primaryDark: '#1D4ED8',
  secondary: '#36D1DC',
  secondaryLight: '#E8FFF3',
  secondaryDark: '#15803D',
  accent: '#5B86E5',
  accentLight: '#FFF1EC',
  accentDark: '#C2410C',

  // Semantic colors
  success: '#4CAF50',
  successLight: '#DCFCE7',
  error: '#F44336',
  errorLight: '#FEE2E2',
  warning: '#FFC107',
  warningLight: '#FEF3C7',
  info: '#2196F3',
  infoLight: '#DBEAFE',

  // Text colors
  text: {
    primary: '#333333',
    secondary: '#666666',
    tertiary: '#999999',
    inverse: '#FFFFFF'
  },

  // Background colors
  background: {
    primary: '#FFFFFF',
    secondary: '#F5F5F5',
    tertiary: '#F1F5F9',
    surface: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },

  // Surface colors
  surface: '#FFFFFF',
  surfaceActive: '#F8FAFC',

  // Border colors
  border: '#F0F0F0',
  borderActive: '#CBD5E1',

  // Overlay colors
  overlay: 'rgba(15, 23, 42, 0.5)',

  // Status colors
  active: '#22C55E',
  inactive: '#94A3B8',

  status: {
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#F44336',
    info: '#2196F3',
  },
} as const;

// Typography system
export const typography = {
  display1: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '700' as const,
  },
  display2: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700' as const,
  },
  heading1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600' as const,
  },
  heading2: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600' as const,
  },
  heading3: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600' as const,
  },
  body1: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  body2: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  label1: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  label2: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
  caption: {
    fontSize: scale(12),
    lineHeight: scale(16),
    color: colors.text.tertiary,
  },
  button1: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  button2: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  buttonLarge: {
    fontSize: scale(16),
    lineHeight: scale(24),
    fontWeight: '600',
  },
  buttonMedium: {
    fontSize: scale(14),
    lineHeight: scale(20),
    fontWeight: '600',
  },
  buttonSmall: {
    fontSize: scale(12),
    lineHeight: scale(16),
    fontWeight: '600',
  },
};

// Layout system
export const layout = {
  screen: {
    backgroundColor: colors.background.primary,
  },
  shadows: {
    small: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    large: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
  },
  borderRadius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
};

// Spacing system
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,
  screenWidth,
  screenHeight,
} as const;

// Animation system
export const animation = {
  durations: {
    fast: 200,
    normal: 300,
    slow: 500,
  },
  easings: {
    easeInOut: 'ease-in-out',
    easeOut: 'ease-out',
    easeIn: 'ease-in',
  },
  springs: {
    gentle: {
      damping: 15,
      stiffness: 150,
    },
    bouncy: {
      damping: 8,
      stiffness: 150,
    },
    slow: {
      damping: 20,
      stiffness: 100,
    },
  },
};

export default {
  colors,
  typography,
  spacing,
  layout,
  animation,
  scale,
};