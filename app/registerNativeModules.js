/**
 * Register Native Modules
 * This file ensures proper initialization of all required native modules
 * It should be imported at the entry point of the application
 */

// Enable native screens implementation for better performance
import { enableScreens } from 'react-native-screens';
enableScreens();

// Import gesture handler to ensure it's available
import 'react-native-gesture-handler';

export default {
  initialized: true
}; 