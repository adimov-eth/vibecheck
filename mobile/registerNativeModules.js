/**
 * Register Native Modules
 * This file ensures proper initialization of all required native modules
 * It should be imported at the entry point of the application
 */

// Import all modules first
import { enableScreens } from 'react-native-screens';
import 'react-native-gesture-handler';

// Then enable screens implementation for better performance
enableScreens();

export default {
  initialized: true
}; 