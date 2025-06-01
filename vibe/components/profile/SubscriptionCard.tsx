import { Button } from '@/components/ui/Button';
import { colors, layout, spacing, typography } from '@/constants/styles';
import type { SubscriptionStatus, UsageStats } from '@/state/types';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface SubscriptionCardProps {
  subscriptionStatus: SubscriptionStatus | null;
  usageStats: UsageStats | null;
  onUpgradePress: () => void;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  subscriptionStatus,
  usageStats,
  onUpgradePress,
}) => {
  const isSubscribed = subscriptionStatus?.isActive ?? false;
  const subscriptionPlan = subscriptionStatus?.type ?? 'N/A';
  const expiryDate = subscriptionStatus?.expiresDate;
  const remainingConversations = usageStats?.remainingConversations ?? 0;

  const getFormattedDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    if (date < new Date() && isSubscribed) return 'Expired'; // Show expired only if was subscribed
    return date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const getUsageText = () => {
    if (!usageStats) return 'Loading usage...';
    if (isSubscribed) return `Plan: ${subscriptionPlan === 'monthly' ? 'Monthly' : 'Yearly'}`; // Show plan type for subscribers

    // Free user usage display
    if (remainingConversations > 0) {
       return `${remainingConversations} conversation${remainingConversations === 1 ? '' : 's'} left`;
    }
       return 'No free conversations left';
  };

  const getExpiryOrResetText = () => {
       if (isSubscribed) {
           return `Renews on ${getFormattedDate(expiryDate)}`;
       }if (remainingConversations <= 0) {
            // Show reset date only if free conversations are used up
            const resetDate = usageStats?.resetDate;
            return `Resets on ${getFormattedDate(resetDate)}`;
       }
       return null; // Don't show reset date if free convos remain
  };


  return (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, isSubscribed ? styles.statusPremium : styles.statusFree]}>
          {isSubscribed ? 'Premium' : 'Free'}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.label}>{isSubscribed ? 'Plan / Usage' : 'Usage'}</Text>
        <Text style={styles.value}>{getUsageText()}</Text>
         {getExpiryOrResetText() && (
             <Text style={styles.detailText}>{getExpiryOrResetText()}</Text>
         )}
      </View>

      {!isSubscribed && (
        <Button
          title="Upgrade to Premium"
          onPress={onUpgradePress}
          variant="outline"
          leftIcon="star-outline"
          style={styles.upgradeButton}
        />
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
  infoRow: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.body1,
    fontWeight: '500',
  },
  detailText: {
       ...typography.caption,
       color: colors.text.secondary,
       marginTop: spacing.xs,
  },
  statusPremium: {
    color: colors.status.success,
    fontWeight: '600',
  },
  statusFree: {
    color: colors.primary,
    fontWeight: '600',
  },
  upgradeButton: {
    marginTop: spacing.sm,
  },
});