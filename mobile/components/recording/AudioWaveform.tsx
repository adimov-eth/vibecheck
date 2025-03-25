import { animation, colors } from '@/constants/styles';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface AudioWaveformProps {
  isActive: boolean;
  color?: string;
  barCount?: number;
  intensity?: number;
  testID?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  color = colors.primary,
  barCount = 40,
  intensity = 0.8,
  testID,
}) => {
  // Create animated values for each bar
  const barValues = useRef<Animated.Value[]>(
    Array(barCount).fill(0).map(() => new Animated.Value(0.2))
  ).current;

  // Create phase animation
  const phaseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      // Continuous phase animation
      const phaseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(phaseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(phaseAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );

      // Start animation
      phaseAnimation.start();

      // Update bar heights based on phase
      const listener = phaseAnim.addListener(({ value }) => {
        barValues.forEach((anim, i) => {
          const phase = (value + i / barCount) % 1;
          const height = 0.2 + intensity * Math.abs(Math.sin(phase * Math.PI * 2));
          anim.setValue(height);
        });
      });

      return () => {
        phaseAnimation.stop();
        phaseAnim.removeListener(listener);
      };
    } else {
      // Animate to resting state
      const staticHeights = Array(barCount).fill(0).map((_, i) => {
        return 0.2 + 0.1 * Math.sin(i / barCount * Math.PI * 2);
      });

      barValues.forEach((anim, i) => {
        Animated.spring(anim, {
          toValue: staticHeights[i],
          ...animation.springs.gentle,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [isActive, barValues, phaseAnim, barCount, intensity]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.waveform}>
        {barValues.map((anim, index) => {
          const isCenter = index === Math.floor(barCount / 2);
          const opacity = isCenter ? 1 : 0.5 + (0.5 * (1 - Math.abs((index - barCount / 2) / (barCount / 2))));

          return (
            <Animated.View
              key={index}
              style={[
                styles.bar,
                {
                  backgroundColor: color,
                  opacity,
                  transform: [
                    { 
                      scaleY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 1],
                      })
                    }
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  bar: {
    flex: 1,
    height: '80%',
    marginHorizontal: 1,
    borderRadius: 2,
  },
}); 