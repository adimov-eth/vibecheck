import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';// Install via npm

const NUM_BARS = 30;
const MAX_HEIGHT = 100; // Increased for more dramatic visuals
const GRID_LINES = [0.2, 0.4, 0.6, 0.8]; // More lines for a denser grid

interface AudioWaveformProps {
  isActive: boolean;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ isActive }) => {
  const phaseAnim = useRef(new Animated.Value(0)).current;
  const barAnims = useRef(
    new Array(NUM_BARS).fill(undefined).map(() => new Animated.Value(0.1))
  ).current;
  const gridShiftAnim = useRef(new Animated.Value(0)).current;
  const touchBoost = useRef<number[]>(new Array(NUM_BARS).fill(0));

  // Grid pulse animation
  const gridOpacityAnim = useRef(new Animated.Value(0.1)).current;

  // PanResponder for touch interaction
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const x = gesture.moveX;
        const barWidth = 360 / NUM_BARS; // Assuming screen width ~360
        const barIndex = Math.floor(x / barWidth);
        for (let i = 0; i < NUM_BARS; i++) {
          const distance = Math.abs(i - barIndex);
          touchBoost.current[i] = distance < 5 ? (5 - distance) * 0.2 : 0;
        }
      },
      onPanResponderRelease: () => {
        touchBoost.current.fill(0);
      },
    })
  ).current;

  useEffect(() => {
    if (isActive) {
      const listener = phaseAnim.addListener(({ value }) => {
        barAnims.forEach((anim, i) => {
          const phase = (value + i / NUM_BARS) % 1;
          const baseHeight =
            0.4 * (Math.sin(2 * Math.PI * phase) + 1) / 2 +
            0.2 * (Math.sin(4 * Math.PI * phase) + 1) / 2 +
            0.1;
          anim.setValue(Math.min(baseHeight + touchBoost.current[i], 1));
        });
      });

      Animated.parallel([
        Animated.loop(
          Animated.timing(phaseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: false,
          })
        ),
        Animated.loop(
          Animated.timing(gridShiftAnim, {
            toValue: 10,
            duration: 3000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(gridOpacityAnim, {
              toValue: 0.3,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(gridOpacityAnim, {
              toValue: 0.1,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        ),
      ]).start();

      return () => phaseAnim.removeListener(listener);
    } else {
      const staticHeights = new Array(NUM_BARS).fill(0).map((_, i) => {
        const phase = i / NUM_BARS;
        return 0.1 + 0.05 * Math.sin(2 * Math.PI * phase);
      });
      Animated.parallel(
        barAnims.map((anim, i) =>
          Animated.timing(anim, {
            toValue: staticHeights[i],
            duration: 300,
            useNativeDriver: false,
          })
        )
      ).start();
      gridOpacityAnim.setValue(0.1);
      gridShiftAnim.setValue(0);
    }
  }, [isActive]);

  return (
    <View style={styles.waveformContainer} {...panResponder.panHandlers}>
      {/* Holographic Grid */}
      {GRID_LINES.map((pos, index) => (
        <Animated.View
          key={index}
          style={[
            styles.gridLine,
            {
              bottom: MAX_HEIGHT * pos,
              opacity: gridOpacityAnim,
              transform: [{ translateX: gridShiftAnim }],
            },
          ]}
        />
      ))}

      {/* Waveform Bars */}
      <View style={styles.barsContainer}>
        {barAnims.map((anim, index) => {
          const coreHeight = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, MAX_HEIGHT],
          });
          const glowHeight = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, MAX_HEIGHT * 1.3],
          });
          const glowOpacity = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.6],
          });
          const tilt = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 5], // Slight tilt for 3D effect
          });

          // Particle effect for taller bars
          const particleOpacity = anim.interpolate({
            inputRange: [0.7, 1],
            outputRange: [0, 1],
          });
          const particleY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -10],
          });

          return (
            <View key={index} style={styles.barContainer}>
              {/* Outer Glow */}
              <Animated.View
                style={[
                  styles.glowBar,
                  {
                    height: glowHeight,
                    opacity: glowOpacity,
                    backgroundColor: 'rgba(0, 150, 255, 0.2)', // Blue glow instead of pink
                  },
                ]}
              />
              {/* Inner Glow */}
              <Animated.View
                style={[
                  styles.glowBar,
                  {
                    height: glowHeight,
                    width: 8,
                    opacity: glowOpacity.interpolate({
                      inputRange: [0, 0.6],
                      outputRange: [0, 0.4],
                    }),
                    backgroundColor: 'rgba(100, 200, 255, 0.3)', // Lighter blue inner glow
                  },
                ]}
              />
              {/* Core Bar with Gradient */}
              <Animated.View
                style={[
                  styles.coreBar,
                  {
                    height: coreHeight,
                    transform: [{ skewX: `${tilt}deg` }],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#4287f5', '#2563eb']} // Blue gradient
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              {/* Particle Spark */}
              {isActive && (
                <Animated.View
                  style={[
                    styles.particle,
                    {
                      opacity: particleOpacity,
                      transform: [{ translateY: particleY }],
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  waveformContainer: {
    position: 'relative',
    height: MAX_HEIGHT,
    width: '100%',
    backgroundColor: 'transparent', // Transparent background instead of dark
  },
  gridLine: {
    position: 'absolute',
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(100, 200, 255, 0.2)', // Blue grid lines
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: MAX_HEIGHT,
    paddingHorizontal: 8,
  },
  barContainer: {
    width: 12,
    height: MAX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  glowBar: {
    width: 12,
    borderRadius: 6,
  },
  coreBar: {
    width: 4,
    borderRadius: 2,
    overflow: 'hidden', // For gradient
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    top: 0,
  },
});

export default AudioWaveform;