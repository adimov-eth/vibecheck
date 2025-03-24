import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface ContainerProps {
  children: React.ReactNode;
  withScrollView?: boolean;
  withSafeArea?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  withScrollView = false,
  withSafeArea = true,
  style,
  contentContainerStyle,
  testID,
}) => {
  const containerView = (
    <View style={[styles.container, style]} testID={testID}>
      {withScrollView ? (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollViewContent, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );

  if (withSafeArea) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        {containerView}
      </SafeAreaView>
    );
  }

  return containerView;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
  },
}); 