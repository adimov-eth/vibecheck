import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { SignedIn } from '@clerk/clerk-expo';
import { colors } from '../styles';
import HomeScreen from './HomeScreen';

export default function Page() {
  return (
    <SafeAreaView style={styles.container}>
      <SignedIn>
        <HomeScreen />
      </SignedIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});