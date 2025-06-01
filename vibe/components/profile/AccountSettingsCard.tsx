import { Button } from '@/components/ui/Button';
import { colors, layout, spacing } from '@/constants/styles';
import type React from 'react';
import { StyleSheet, View } from 'react-native';

interface AccountSettingsCardProps {
  onSignOutPress: () => void;
}

export const AccountSettingsCard: React.FC<AccountSettingsCardProps> = ({
  onSignOutPress,
}) => {
  return (
    <View style={styles.card}>
      <Button
        title="Sign Out"
        onPress={onSignOutPress}
        variant="primary"
        leftIcon="log-out-outline"
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: layout.borderRadius.lg,
    padding: spacing.lg,
  },
  button: {
    marginBottom: spacing.md,
  },
});