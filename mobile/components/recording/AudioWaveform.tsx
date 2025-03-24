import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface AudioWaveformProps {
  isActive: boolean;
  color?: string;
  barCount?: number;
  testID?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  color = '#2563eb',
  barCount = 30,
  testID,
}) => {
  const phaseAnim = useRef(new Animated.Value(0)).current;
  const barValues = useRef(
    Array(barCount).fill(0).map(() => new Animated.Value(0.2))
  ).current;

  useEffect(() => {
    if (isActive) {
      // Animate phase continuously
      const phaseAnimation = Animated.loop(
        Animated.timing(phaseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        })
      );

      // Start animation
      phaseAnimation.start();

      // Update bar heights based on phase
      const listener = phaseAnim.addListener(({ value }) => {
        barValues.forEach((anim, i) => {
          const phase = (value + i / barCount) % 1;
          const height = 0.2 + 0.6 * Math.abs(Math.sin(phase * Math.PI * 2));
          anim.setValue(height);
        });
      });

      return () => {
        phaseAnimation.stop();
        phaseAnim.removeListener(listener);
      };
    } else {
      // Set static values for inactive state
      const staticHeights = Array(barCount).fill(0).map((_, i) => {
        return 0.2 + 0.1 * Math.sin(i / barCount * Math.PI * 2);
      });
      
      barValues.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: staticHeights[i],
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isActive, barValues, phaseAnim, barCount]);

  const containerHeight = 100; // Fixed height for the waveform

  return (
    <View style={[styles.container, { height: containerHeight }]} testID={testID}>
      <View style={styles.waveform}>
        {barValues.map((anim, index) => (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                height: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, containerHeight],
                }),
                backgroundColor: color,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    paddingHorizontal: 8,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    marginHorizontal: 1,
  },
}); 