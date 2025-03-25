/**
 * Entry point for the application
 * Registers native modules first, then loads the Expo Router
 */

// Register native modules first
import './registerNativeModules';

// Then load the Expo Router entry point
import 'expo-router/entry';
