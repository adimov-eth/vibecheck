import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, StyleProp, ViewStyle } from 'react-native';
import { colors, typography, spacing, layout } from '../app/styles';

const { width } = Dimensions.get('window');
const cardIconSize = width * 0.12; // Responsive icon size

interface ModeIconProps {
  mode: string;
  color: string;
}

const ModeIcon: React.FC<ModeIconProps> = ({ mode, color }) => {
  return (
    <View style={[styles.iconContainer, { backgroundColor: color }]}>
      <Text style={styles.iconText}>
        {mode === 'mediator' ? '⚖️' : mode === 'whosRight' ? '🔨' : mode === 'dinner' ? '🍽️' : '📺'}
      </Text>
    </View>
  );
};

interface ModeCardProps {
  mode: string;
  title: string;
  description: string;
  color: string;
  isActive?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const ModeCard: React.FC<ModeCardProps> = ({
  mode,
  title,
  description,
  color,
  isActive = false,
  onPress,
  style
}) => {
  const cardStyles = [
    styles.card,
    isActive && styles.activeCard,
    style
  ];

  return (
    <TouchableOpacity
      style={cardStyles}
      onPress={onPress}
      activeOpacity={0.7}
      accessible={true}
      accessibilityLabel={`${title} mode. ${description}`}
      accessibilityRole="button"
    >
      <ModeIcon mode={mode} color={color} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.description} numberOfLines={2}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: layout.borderRadius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md, // Reduced from lg for better spacing
    width: '100%',
    ...layout.cardShadow,
  },
  activeCard: {
    borderColor: colors.primary,
    borderWidth: 2, // More noticeable active state
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  content: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  title: {
    ...typography.heading3,
    fontSize: Math.min(18, width * 0.045), // Responsive font size with cap
    color: colors.darkText,
    marginBottom: spacing.xs / 2,
  },
  description: {
    ...typography.body2,
    color: colors.mediumText,
  },
  iconContainer: {
    width: cardIconSize,
    height: cardIconSize,
    borderRadius: cardIconSize / 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  iconText: {
    fontSize: cardIconSize * 0.5,
    color: colors.white,
  },
});

export default ModeCard;