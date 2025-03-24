import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ToggleProps {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  testID?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  options,
  selectedIndex,
  onChange,
  disabled = false,
  testID,
}) => {
  return (
    <View 
      style={[styles.container, disabled && styles.disabled]} 
      testID={testID}
    >
      {options.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.option,
            selectedIndex === index && styles.selectedOption,
          ]}
          onPress={() => onChange(index)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityState={{ selected: selectedIndex === index, disabled }}
        >
          <Text 
            style={[
              styles.optionText,
              selectedIndex === index && styles.selectedOptionText,
              disabled && styles.disabledText,
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
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 4,
  },
  disabled: {
    opacity: 0.5,
  },
  option: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  selectedOption: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
  },
  selectedOptionText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  disabledText: {
    color: '#94a3b8',
  },
}); 