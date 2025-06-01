import { Button } from '@/components/ui/Button';
import { colors, layout, spacing, typography } from '@/constants/styles';
import type React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

interface AppDataCardProps {
  isClearingCache: boolean;
  onClearCachePress: () => void;
  clearCacheError?: string | null;
  showDevOptions?: boolean;
  currentUsage?: number;
  usageLimit?: number;
  onViewPaywallPress?: () => void;
}

export const AppDataCard: React.FC<AppDataCardProps> = ({
  isClearingCache,
  onClearCachePress,
  clearCacheError,
  showDevOptions = false,
  currentUsage = 0,
  usageLimit = 0,
  onViewPaywallPress,
}) => {
  const handleClearCacheConfirm = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached recordings and conversation data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: onClearCachePress },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.buttonContainer}>
        <Text style={styles.buttonLabel}>Clear cached recordings & data</Text>
        <Button
          title="Clear Cache"
          variant="outline"
          size="small"
          onPress={handleClearCacheConfirm}
          leftIcon="trash-outline"
          loading={isClearingCache}
          disabled={isClearingCache}
        />
      </View>
      {clearCacheError && (
        <Text style={styles.errorText}>{clearCacheError}</Text>
      )}

      {showDevOptions && (
        <>
          <View style={[styles.devContainer, styles.buttonContainer]}>
             <Text style={styles.buttonLabel}>Usage: {currentUsage}/{usageLimit}</Text>
          </View>
          {onViewPaywallPress && (
              <View style={[styles.devContainer, styles.buttonContainer]}>
                <Text style={styles.buttonLabel}>View paywall (DEV)</Text>
                <Button
                  title="View" variant="outline" size="small"
                  onPress={onViewPaywallPress} leftIcon="card-outline"
                />
              </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: layout.borderRadius.lg,
    padding: spacing.lg,
    ...layout.shadows.small,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  buttonLabel: {
    ...typography.body2,
    flex: 1,
    marginRight: spacing.md,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm, // Align roughly with label
  },
  devContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
