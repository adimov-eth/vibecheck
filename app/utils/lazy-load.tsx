/**
 * Utilities for lazy loading components and screens
 * Improves performance by splitting code bundles
 */
import React, { Suspense, lazy } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

// Theme constants
const colors = {
  primary: '#6200ee',
  background: '#ffffff',
  mediumText: '#666666',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
};

/**
 * Props for the loading component
 */
interface LoadingProps {
  /** Message to display during loading */
  message?: string;
}

/**
 * Default loading component for code-split imports
 * @param props Component props
 * @returns Loading indicator component
 */
function LoadingComponent({ message = 'Loading...' }: LoadingProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

/**
 * Create a lazy-loaded component with standard loading indicator
 * @param importFn Dynamic import function for the component
 * @param loadingProps Optional loading component props
 * @returns Wrapped component with suspense boundary
 */
export function createLazyComponent<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  loadingProps?: LoadingProps
): React.FC<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFn);
  
  // Create a wrapper function component
  const WrappedComponent: React.FC<React.ComponentProps<T>> = (props) => (
    <Suspense fallback={<LoadingComponent {...loadingProps} />}>
      <LazyComponent {...props} />
    </Suspense>
  );
  
  // Set display name for debugging
  WrappedComponent.displayName = `LazyLoaded(${importFn.name || 'Component'})`;
  
  return WrappedComponent;
}

// Styles for loading component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  text: {
    marginTop: spacing.md,
    color: colors.mediumText,
    textAlign: 'center',
  },
});
