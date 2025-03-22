import React from 'react';
import Toast, { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../app/styles';
import { Ionicons } from '@expo/vector-icons';

// Define our custom props with the text fields we need
interface CustomToastProps {
  text1?: string;
  text2?: string;
  props: any;
}

// Custom toast configurations
const toastConfig: ToastConfig = {
  // Override the default success type
  success: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: colors.success,
        backgroundColor: colors.cardBackground,
        height: 'auto',
        minHeight: 60,
        paddingVertical: spacing.sm,
      }}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
      text1Style={{
        ...typography.body1,
        fontWeight: '600',
        color: colors.darkText,
      }}
      text2Style={{
        ...typography.body2,
        color: colors.mediumText,
      }}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        </View>
      )}
    />
  ),

  // Override the default error type
  error: (props) => (
    <ErrorToast
      {...props}
      style={{
        borderLeftColor: colors.error,
        backgroundColor: colors.cardBackground,
        height: 'auto',
        minHeight: 60,
        paddingVertical: spacing.sm,
      }}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
      text1Style={{
        ...typography.body1,
        fontWeight: '600',
        color: colors.darkText,
      }}
      text2Style={{
        ...typography.body2,
        color: colors.mediumText,
      }}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle" size={24} color={colors.error} />
        </View>
      )}
    />
  ),

  // Warning toast type
  warning: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: colors.warning,
        backgroundColor: colors.cardBackground,
        height: 'auto',
        minHeight: 60,
        paddingVertical: spacing.sm,
      }}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
      text1Style={{
        ...typography.body1,
        fontWeight: '600',
        color: colors.darkText,
      }}
      text2Style={{
        ...typography.body2,
        color: colors.mediumText,
      }}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={24} color={colors.warning} />
        </View>
      )}
    />
  ),

  // Info toast type
  info: (props) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: colors.info,
        backgroundColor: colors.cardBackground,
        height: 'auto',
        minHeight: 60,
        paddingVertical: spacing.sm,
      }}
      contentContainerStyle={{ paddingHorizontal: spacing.md }}
      text1Style={{
        ...typography.body1,
        fontWeight: '600',
        color: colors.darkText,
      }}
      text2Style={{
        ...typography.body2,
        color: colors.mediumText,
      }}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="information-circle" size={24} color={colors.info} />
        </View>
      )}
    />
  ),

  // Custom network error type
  networkError: ({ text1, text2, ...props }: CustomToastProps) => (
    <View style={styles.networkErrorContainer}>
      <View style={styles.networkErrorIconContainer}>
        <Ionicons name="cloud-offline" size={24} color={colors.cardBackground} />
      </View>
      <View style={styles.networkErrorTextContainer}>
        <Text style={styles.networkErrorText1}>{text1}</Text>
        {text2 && <Text style={styles.networkErrorText2}>{text2}</Text>}
      </View>
    </View>
  ),
};

// Helper functions to show toast messages from anywhere in the app
export const showToast = {
  success: (title: string, message?: string) => {
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  error: (title: string, message?: string) => {
    Toast.show({
      type: 'error',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  networkError: (title: string = 'Network Error', message: string = 'Please check your connection and try again') => {
    Toast.show({
      type: 'networkError',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  warning: (title: string, message?: string) => {
    Toast.show({
      type: 'warning',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  info: (title: string, message?: string) => {
    Toast.show({
      type: 'info',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 3000,
    });
  }
};

// Styles
const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  networkErrorContainer: {
    flexDirection: 'row',
    width: '90%',
    backgroundColor: colors.error,
    borderRadius: 8,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  networkErrorIconContainer: {
    marginRight: spacing.md,
    justifyContent: 'center',
  },
  networkErrorTextContainer: {
    flex: 1,
  },
  networkErrorText1: {
    ...typography.body1,
    color: colors.cardBackground,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  networkErrorText2: {
    ...typography.body2,
    color: colors.cardBackground,
  },
});

// Toast component to be added at the root of your app
export const ToastComponent = () => <Toast config={toastConfig} />;

export default ToastComponent; 