// app/components/ui/Toast.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Toast, { BaseToast, BaseToastProps, ErrorToast, ToastConfig } from 'react-native-toast-message';

// Configure toast appearance
const toastConfig: ToastConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={styles.successToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.title}
      text2Style={styles.message}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
        </View>
      )}
    />
  ),
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      style={styles.errorToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.title}
      text2Style={styles.message}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle" size={24} color="#dc2626" />
        </View>
      )}
    />
  ),
  info: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={styles.infoToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.title}
      text2Style={styles.message}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="information-circle" size={24} color="#2563eb" />
        </View>
      )}
    />
  ),
  warning: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={styles.warningToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.title}
      text2Style={styles.message}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={24} color="#d97706" />
        </View>
      )}
    />
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
  info: (title: string, message?: string) => {
    Toast.show({
      type: 'info',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 3000,
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
};

// Toast component to be added at the root of your app
export const ToastProvider: React.FC = () => <Toast config={toastConfig} />;

const styles = StyleSheet.create({
  successToast: {
    borderLeftColor: '#16a34a',
    backgroundColor: '#ffffff',
    height: 'auto',
    minHeight: 60,
    paddingVertical: 8,
  },
  errorToast: {
    borderLeftColor: '#dc2626',
    backgroundColor: '#ffffff',
    height: 'auto',
    minHeight: 60,
    paddingVertical: 8,
  },
  infoToast: {
    borderLeftColor: '#2563eb',
    backgroundColor: '#ffffff',
    height: 'auto',
    minHeight: 60,
    paddingVertical: 8,
  },
  warningToast: {
    borderLeftColor: '#d97706',
    backgroundColor: '#ffffff',
    height: 'auto',
    minHeight: 60,
    paddingVertical: 8,
  },
  contentContainer: {
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  message: {
    fontSize: 14,
    color: '#334155',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
  },
});
