import { useUser as useClerkUser, useClerk } from '@clerk/clerk-expo';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AppBar from '../components/AppBar';
import Button from '../components/Button';
import { ClearCacheButton } from '../components/ClearCacheButton';
import { UserProfileCard } from '../components/UserProfileCard';
import { colors, typography, spacing, layout } from './styles';
import { useSubscriptionStatus, useUsageStats } from '../hooks/useApiQueries';
import { useSubscriptionCheck } from '../hooks/useSubscriptionCheck';
import { UsageStats } from '../types/api';

function Page() {
  const { user } = useClerkUser();
  const { signOut } = useClerk();
  const [isLoading, setIsLoading] = useState(false);

  const { data: subscriptionStatus } = useSubscriptionStatus();
  const { data: usageStats, isLoading: usageLoading, refetch: refreshUsage } = useUsageStats();
  const { getSubscriptionDetails, openSubscriptionSettings } = useSubscriptionCheck();

  const subscriptionDetails = getSubscriptionDetails();

  const handleRefreshAll = async () => {
    await Promise.all([refreshUsage()]);
    // Note: refetching subscription status and profile can be added if needed via useQueryClient
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToUpdatePassword = () => {
    router.push('/update-user');
  };

  const navigateToPaywall = () => {
    router.push('/paywall');
  };

  const handleManageSubscription = () => {
    if (subscriptionStatus?.isSubscribed) {
      openSubscriptionSettings();
    } else {
      navigateToPaywall();
    }
  };

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(home)');
    }
  };

  const getFormattedResetDate = () => {
    const stats = usageStats as UsageStats | undefined;
    if (!stats?.resetDate) return 'next month';
    return new Date(stats.resetDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar title="Profile" showBackButton={true} onBackPress={handleBackPress} showAvatar={false} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0] || user?.emailAddresses[0].emailAddress?.[0] || '?'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.firstName || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.emailAddresses[0].emailAddress}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.subscriptionStatusContainer}>
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionLabel}>Status</Text>
                <Text
                  style={[
                    styles.subscriptionStatus,
                    subscriptionStatus?.isSubscribed ? styles.statusPremium : styles.statusFree,
                  ]}
                >
                  {subscriptionStatus?.isSubscribed ? 'Premium' : 'Free'}
                </Text>
              </View>
              {subscriptionStatus?.isSubscribed ? (
                <>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.subscriptionLabel}>Plan</Text>
                    <Text style={styles.subscriptionValue}>
                      {subscriptionDetails.type === 'monthly' ? 'Monthly' : 'Yearly'}
                    </Text>
                  </View>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.subscriptionLabel}>Renewal</Text>
                    <Text style={styles.subscriptionValue}>
                      {subscriptionDetails.formattedExpiryDate || 'Unknown'}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionLabel}>Usage</Text>
                  <Text style={styles.subscriptionValue}>
                    {usageLoading
                      ? 'Loading...'
                      : (() => {
                          const stats = usageStats as UsageStats | undefined;
                          return stats && typeof stats.remainingConversations === 'number' && stats.remainingConversations > 0
                            ? `${stats.remainingConversations} conversations left`
                            : 'No conversations left';
                        })()}
                  </Text>
                  {(() => {
                    const stats = usageStats as UsageStats | undefined;
                    return stats && typeof stats.remainingConversations === 'number' && stats.remainingConversations === 0 && (
                      <Text style={styles.resetDateText}>Resets on {getFormattedResetDate()}</Text>
                    );
                  })()}
                </View>
              )}
            </View>
            <Button
              title={subscriptionStatus?.isSubscribed ? 'Manage Subscription' : 'Upgrade to Premium'}
              onPress={handleManageSubscription}
              variant={subscriptionStatus?.isSubscribed ? 'outline' : 'primary'}
              icon={
                <Ionicons
                  name={subscriptionStatus?.isSubscribed ? 'settings-outline' : 'star-outline'}
                  size={20}
                  color={subscriptionStatus?.isSubscribed ? colors.primary : colors.white}
                />
              }
              style={styles.button}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <View style={styles.card}>
            <Button
              title="Update Password"
              onPress={navigateToUpdatePassword}
              variant="outline"
              icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />}
              style={styles.button}
            />
            <Button
              title="Sign Out"
              onPress={handleSignOut}
              variant="primary"
              loading={isLoading}
              icon={<Ionicons name="log-out-outline" size={20} color={colors.white} />}
              style={styles.button}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Data</Text>
          <View style={styles.card}>
            <View style={styles.buttonContainer}>
              <Text style={styles.buttonLabel}>Clear all cached recordings and conversation data</Text>
              <ClearCacheButton buttonText="Clear Cache" />
            </View>
            {__DEV__ && (
              <View style={[styles.buttonContainer, styles.devContainer]}>
                <Text style={styles.buttonLabel}>View paywall (DEV only)</Text>
                <Button
                  title="View"
                  variant="outline"
                  size="small"
                  onPress={navigateToPaywall}
                  icon={<Ionicons name="card-outline" size={16} color={colors.primary} />}
                />
              </View>
            )}
          </View>
        </View>

        <UserProfileCard onRefresh={handleRefreshAll} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default Page;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...layout.cardShadow,
  },
  avatarText: {
    fontSize: 32,
    color: colors.white,
    fontFamily: 'Inter-Bold',
  },
  userName: {
    ...typography.heading2,
    marginBottom: spacing.xs,
  },
  userEmail: {
    ...typography.body1,
    color: colors.mediumText,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: layout.borderRadius.medium,
    padding: spacing.lg,
    ...layout.cardShadow,
  },
  button: {
    marginBottom: spacing.md,
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
  },
  subscriptionStatusContainer: {
    marginBottom: spacing.lg,
  },
  subscriptionInfo: {
    marginBottom: spacing.md,
  },
  subscriptionLabel: {
    ...typography.caption,
    color: colors.mediumText,
    marginBottom: spacing.xs,
  },
  subscriptionStatus: {
    ...typography.heading3,
    fontWeight: '600',
  },
  statusPremium: {
    color: colors.success,
  },
  statusFree: {
    color: colors.primary,
  },
  subscriptionValue: {
    ...typography.body1,
  },
  resetDateText: {
    ...typography.caption,
    color: colors.mediumText,
    marginTop: spacing.xs,
  },
  devContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});