import { colors } from '@/constants/styles';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming
} from 'react-native-reanimated';

const ReanimatedView = Reanimated.createAnimatedComponent(View);

interface WaveVisualizationProps {
  isRecording: boolean;
  points: number[];
}

export function WaveVisualization({ isRecording, points }: WaveVisualizationProps) {
  const waveScale = useSharedValue(1);
  const waveOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isRecording) {
      waveScale.value = withRepeat(
        withTiming(1.2, { duration: 1000 }),
        -1,
        true
      );
      waveOpacity.value = withRepeat(
        withTiming(0.6, { duration: 1000 }),
        -1,
        true
      );
    } else {
      waveScale.value = withSpring(1);
      waveOpacity.value = withSpring(0.3);
    }
  }, [isRecording]);

  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: waveScale.value }],
    opacity: waveOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <ReanimatedView style={[styles.wave, waveStyle]}>
        {points.map((point, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${point * 100}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        ))}
      </ReanimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 20,
  },
  bar: {
    width: 3,
    marginHorizontal: 1,
    borderRadius: 1.5,
  },
}); 