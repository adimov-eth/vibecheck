import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { colors, typography, spacing, layout } from '../app/styles';

const { width } = Dimensions.get('window');

interface ToggleProps {
  options: string[];
  selectedIndex: number;
  onToggle: (index: number) => void;
}

const Toggle: React.FC<ToggleProps> = ({ options, selectedIndex, onToggle }) => {
  // Calculate responsive toggle width
  const toggleWidth = Math.min(160, width * 0.4);
  
  return (
    <View style={[styles.container, { width: toggleWidth }]}>
      {options.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.toggleItem,
            selectedIndex === index && styles.selectedItem,
          ]}
          onPress={() => onToggle(index)}
          activeOpacity={0.7}
          accessible={true}
          accessibilityLabel={option}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedIndex === index }}
        >
          <Text
            style={[
              styles.toggleText,
              selectedIndex === index && styles.selectedText,
            ]}
            numberOfLines={1}
          >
            {option}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: layout.borderRadius.medium,
    padding: spacing.xs,
    alignSelf: 'flex-end',
    height: 36, // Fixed height for consistent UI
  },
  toggleItem: {
    flex: 1,
    borderRadius: layout.borderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  selectedItem: {
    backgroundColor: colors.white,
    ...layout.cardShadow,
  },
  toggleText: {
    ...typography.body3,
    fontWeight: '500',
    color: colors.lightText,
    textAlign: 'center',
  },
  selectedText: {
    fontWeight: '600',
    color: colors.darkText,
  },
});

export default Toggle;