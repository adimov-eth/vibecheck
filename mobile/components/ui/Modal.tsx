import { animation, colors, layout, spacing, typography } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Animated,
    Pressable,
    Modal as RNModal,
    StyleProp,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
    ViewStyle,
} from 'react-native';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  closeOnBackdropPress?: boolean;
  animationType?: 'slide' | 'fade' | 'none';
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  children,
  style,
  testID,
  closeOnBackdropPress = true,
  animationType = 'fade',
}) => {
  const { height } = useWindowDimensions();
  const [fadeAnim] = React.useState(() => new Animated.Value(0));
  const [scaleAnim] = React.useState(() => new Animated.Value(0.95));

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          ...animation.springs.gentle,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          ...animation.springs.gentle,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 0.95,
          ...animation.springs.gentle,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent
      testID={testID}
    >
      <Pressable
        style={[styles.backdrop, { minHeight: height }]}
        onPress={() => closeOnBackdropPress && onClose()}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
            style,
          ]}
        >
          <View style={styles.header}>
            {title && (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            )}
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={8}
              testID={`${testID}-close-button`}
            >
              <Ionicons
                name="close"
                size={24}
                color={colors.text.secondary}
              />
            </Pressable>
          </View>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </Pressable>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderRadius: layout.borderRadius.lg,
    width: '100%',
    maxWidth: 500,
    ...layout.shadows.large,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.heading3,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.md,
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: layout.borderRadius.full,
  },
  content: {
    padding: spacing.lg,
  },
}); 