import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';

interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
  testID?: string;
}

export const RecordButton: React.FC<RecordButtonProps> = ({
  isRecording,
  onPress,
  size = 80,
  disabled = false,
  testID,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Button scale animation when recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Reset animations
      pulseAnim.setValue(1);
      scaleAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
      scaleAnim.stopAnimation();
    };
  }, [isRecording, pulseAnim, scaleAnim]);

  const buttonColor = isRecording 
    ? '#dc2626' 
    : disabled 
      ? '#d1d5db' 
      : '#2563eb';

  return (
    <View style={styles.container} testID={testID}>
      {isRecording && (
        <Animated.View
          style={[
            styles.pulse,
            {
              width: size * 1.4,
              height: size * 1.4,
              borderRadius: (size * 1.4) / 2,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
      )}
      
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
        }}
      >
        <TouchableOpacity
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: buttonColor,
            },
          ]}
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.8}
          accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          <Ionicons
            name={isRecording ? "square" : "mic"}
            size={isRecording ? size / 3 : size / 2}
            color="#ffffff"
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  pulse: {
    position: 'absolute',
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
}); 