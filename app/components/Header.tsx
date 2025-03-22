import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, colors, spacing } from '../app/styles';

interface HeaderProps {
  showBackButton?: boolean;
  onBackPress?: () => void;
  backText?: string;
  showLogo?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  showBackButton = false,
  onBackPress,
  backText = 'Back',
  showLogo = true,
}) => {
  return (
    <View style={styles.container}>
      {showBackButton && (
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={onBackPress}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={colors.darkText} />
          <Text style={styles.backText}>{backText}</Text>
        </TouchableOpacity>
      )}
      
      {showLogo && (
        <View style={styles.titleContainer}>
          <Text style={styles.title}>VibeCheck</Text>
          <Text style={styles.subtitle}>
            An objective 3rd party to help you settle whatever needs settling
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.section,
    paddingBottom: spacing.md,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.heading2,
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.darkText,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body2,
    color: colors.mediumText,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  backText: {
    ...typography.body1,
    color: colors.darkText,
    marginLeft: spacing.xs,
  },
});

export default Header; 