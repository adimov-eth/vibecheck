import React from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../app/styles';

interface AudioRecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
}

const AudioRecordButton: React.FC<AudioRecordButtonProps> = ({
  isRecording,
  onPress,
  size = 80,
  disabled = false,
}) => {
  const rippleScale = React.useRef(new Animated.Value(1)).current;
  const rippleOpacity = React.useRef(new Animated.Value(0.2)).current;
  const buttonScale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isRecording) {
      // Start ripple animation
      Animated.loop(
        Animated.parallel([
          Animated.timing(rippleScale, {
            toValue: 1.5,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(rippleOpacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Pulse the button slightly
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonScale, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(buttonScale, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Reset animations
      rippleScale.setValue(1);
      rippleOpacity.setValue(0.2);
      buttonScale.setValue(1);
    }
  }, [buttonScale, isRecording, rippleOpacity, rippleScale]);

  return (
    <View style={styles.container}>
      {isRecording && (
        <Animated.View
          style={[
            styles.ripple,
            {
              width: size * 1.5,
              height: size * 1.5,
              borderRadius: (size * 1.5) / 2,
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            },
          ]}
        />
      )}
      <Animated.View
        style={{
          transform: [{ scale: buttonScale }],
        }}
      >
        <TouchableOpacity
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: isRecording 
                ? colors.error 
                : disabled 
                  ? '#cccccc' 
                  : colors.primary,
            },
          ]}
          onPress={onPress}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Ionicons
            name={isRecording ? "square" : "mic"}
            size={isRecording ? size / 3 : size / 2}
            color="white"
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
  ripple: {
    position: 'absolute',
    backgroundColor: colors.primary,
    opacity: 0.2,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
});

export default AudioRecordButton;