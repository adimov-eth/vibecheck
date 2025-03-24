import { Dimensions, TextStyle, ViewStyle } from 'react-native';

const { width } = Dimensions.get('window');
const screenWidth = width;

// Function to calculate responsive sizes
const scale = (size: number): number => (screenWidth / 375) * size;

export const colors = {
  primary: '#3B71FE',
  primaryLight: '#4C88FF',
  secondary: '#58BD7D',
  accent: '#FF6838',
  background: '#F9FAFC',
  cardBackground: '#FFFFFF',
  darkText: '#292D32',
  mediumText: '#64748B',
  lightText: '#94A3B8',
  border: '#E3E9EE',
  white: '#FFFFFF',
  error: '#FF4D4F',
  success: '#58BD7D',
  info: '#4BC9F0',
  warning: '#F2C94C',
  shadow: 'rgba(0, 0, 0, 0.08)',
};

export const typography = {
  heading1: {
    fontFamily: 'Inter-Bold',
    fontSize: scale(32),
    lineHeight: scale(38),
    letterSpacing: -0.5,
    textAlign: 'center',
    color: colors.darkText,
  } as TextStyle,
  heading2: {
    fontFamily: 'Inter-Bold',
    fontSize: scale(24),
    lineHeight: scale(32),
    letterSpacing: -0.3,
    color: colors.darkText,
  } as TextStyle,
  heading3: {
    fontFamily: 'Inter-SemiBold',
    fontSize: scale(20),
    lineHeight: scale(28),
    letterSpacing: -0.2,
    color: colors.darkText,
  } as TextStyle,
  body1: {
    fontFamily: 'Inter-Regular',
    fontSize: scale(16),
    lineHeight: scale(24),
    color: colors.mediumText,
  } as TextStyle,
  body2: {
    fontFamily: 'Inter-Regular',
    fontSize: scale(14),
    lineHeight: scale(20),
    color: colors.mediumText,
  } as TextStyle,
  body3: {
    fontFamily: 'Inter-Regular',
    fontSize: scale(12),
    lineHeight: scale(16),
    color: colors.mediumText,
  } as TextStyle,
  buttonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: scale(16),
    lineHeight: scale(24),
    letterSpacing: -0.14,
    color: colors.white,
  } as TextStyle,
  caption: {
    fontFamily: 'Inter-Medium',
    fontSize: scale(12),
    lineHeight: scale(16),
    color: colors.lightText,
  } as TextStyle,
};

export const spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(20),
  xxl: scale(24),
  section: scale(32),
};

export const layout = {
  screenPadding: {
    paddingHorizontal: '5%', // Percentage-based horizontal padding
    paddingVertical: spacing.xl,
  } as ViewStyle,
  cardShadow: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  borderRadius: {
    small: scale(8),
    medium: scale(12),
    large: scale(16),
    xl: scale(24),
  },
  // Add safe area insets
  safeArea: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  // Container styles
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flex: 1,
    width: '100%',
  },
};

// Default export for convenience
export default {
  colors,
  typography,
  spacing,
  layout,
  scale,
};