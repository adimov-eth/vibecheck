import { animation, colors, typography } from '@/constants/styles';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface TimerProps {
  isRunning: boolean;
  seconds: number;
  testID?: string;
}

export const Timer: React.FC<TimerProps> = ({
  isRunning,
  seconds,
  testID,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (isRunning) {
      // Fade in and scale up when starting
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          useNativeDriver: true,
          ...animation.springs.gentle,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          ...animation.springs.gentle,
        }),
      ]).start();
    } else {
      // Fade out and scale down when stopping
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 0,
          useNativeDriver: true,
          ...animation.springs.gentle,
        }),
        Animated.spring(scaleAnim, {
          toValue: 0.9,
          useNativeDriver: true,
          ...animation.springs.gentle,
        }),
      ]).start();
    }
  }, [isRunning, fadeAnim, scaleAnim]);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const timeString = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  return (
    <View style={styles.container} testID={testID}>
      <Animated.Text
        style={[
          styles.timer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {timeString}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  timer: {
    ...typography.display1,
    color: colors.primary,
  },
}); 