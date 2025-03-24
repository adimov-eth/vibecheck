import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Card } from '../ui/Card';

interface ModeCardProps {
  id: string;
  title: string;
  description: string;
  color: string;
  icon?: string;
  isSelected?: boolean;
  onPress: (id: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  id,
  title,
  description,
  color,
  icon = '🔍',
  isSelected = false,
  onPress,
  testID,
  style,
}) => {
  console.log('style', style);
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      testID={testID}
    >
      <Card
        style={[
          styles.card,
          isSelected && {
            borderColor: color,
            borderWidth: 2,
          },
        ]}
        elevated={true}
        padded={false}
      >
        <View style={styles.container}>
          <View style={[styles.iconContainer, { backgroundColor: color }]}>
            <Text style={styles.icon}>{icon}</Text>
          </View>
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
}); 