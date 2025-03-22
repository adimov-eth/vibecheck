import Toast from 'react-native-toast-message';

/**
 * Utility for displaying toast notifications
 */
export const showToast = {
  /**
   * Shows a success toast notification
   * @param title - The main toast title
   * @param message - Optional detailed message
   */
  success: (title: string, message?: string) => {
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  
  /**
   * Shows an error toast notification
   * @param title - The main toast title
   * @param message - Optional detailed message
   */
  error: (title: string, message?: string) => {
    Toast.show({
      type: 'error',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  
  /**
   * Shows a network error toast notification
   * @param title - The main toast title (defaults to 'Network Error')
   * @param message - Optional detailed message (defaults to connection check message)
   */
  networkError: (title: string = 'Network Error', message: string = 'Please check your connection and try again') => {
    Toast.show({
      type: 'networkError',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  
  /**
   * Shows a warning toast notification
   * @param title - The main toast title
   * @param message - Optional detailed message
   */
  warning: (title: string, message?: string) => {
    Toast.show({
      type: 'warning',
      text1: title,
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
    });
  },
  
  /**
   * Shows an info toast notification
   * @param title - The main toast title
   * @param message - Optional detailed message
   */
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