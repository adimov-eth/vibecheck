import React from 'react';
import { Dimensions, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

const { width } = Dimensions.get('window');
const cardIconSize = width * 0.12; // Responsive icon size

interface ModeIconProps {
  mode: string;
  color: string;
}

const ModeIcon: React.FC<ModeIconProps> = ({ mode, color }) => {
  const getIcon = (mode: string): string => {
    switch (mode) {
      case 'mediator':
        return '⚖️';
      case 'whosRight':
        return '🔨';
      case 'dinner':
        return '🍽️';
      default:
        return '📺';
    }
  };

  return (
    <View style={[styles.iconContainer, { backgroundColor: color }]}>
      <Text style={styles.iconText}>{getIcon(mode)}</Text>
    </View>
  );
};

interface ModeCardProps {
  id: string;
  mode: string;
  title: string;
  description: string;
  color: string;
  isSelected?: boolean;
  onPress: (id: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  id,
  mode,
  title,
  description,
  color,
  isSelected = false,
  onPress,
  testID,
  style,
}) => {
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      testID={testID}
      style={[styles.card, isSelected && styles.activeCard, style]}
    >
      <ModeIcon mode={mode} color={color} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
    marginBottom: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  activeCard: {
    borderColor: '#0ea5e9',
    borderWidth: 2,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  content: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: Math.min(18, width * 0.045),
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
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
  },
}); 