import { AppBar } from '@/components/layout/AppBar';
import { Button } from '@/components/ui/Button';
import { colors, layout, spacing, typography } from '@/constants/styles';
import useStore from '@/state';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function Profile() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();
  const store = useStore();

  useEffect(() => {
    store.checkSubscriptionStatus().catch(() => {});
    store.getUsageStats().catch(() => {});
  }, [store]);

  const handleBackPress = () => router.back();
  const handleSignOut = async () => await signOut();
  const navigateToUpdatePassword = () => router.push('/profile/update-password');
  const navigateToPaywall = () => router.push('/paywall');

  const isSubscribed = store.subscriptionStatus?.active ?? false;
  const subscriptionPlan = store.subscriptionStatus?.plan ?? 'none';
  const expiryDate = store.subscriptionStatus?.expiresAt;
  const remainingConversations = store.usageStats?.remainingMinutes ?? 0;
  const currentUsage = store.usageStats?.totalMinutes || 0;
  const usageLimit = store.usageStats ? 
    (store.usageStats.totalMinutes + store.usageStats.remainingMinutes) : 0;
  
  // Calculate reset date as 30 days from subscription start or last reset
  const getFormattedResetDate = () => {
    if (!expiryDate) return 'Unknown';
    const resetDate = new Date(expiryDate);
    resetDate.setDate(resetDate.getDate() - 30); // Show next reset date
    return resetDate.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar 
        title="Profile" 
        showBackButton={true} 
        onBackPress={handleBackPress} 
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0] || '?'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.firstName || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.emailAddresses?.[0]?.emailAddress}</Text>
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
                    isSubscribed ? styles.statusPremium : styles.statusFree,
                  ]}
                >
                  {isSubscribed ? 'Premium' : 'Free'}
                </Text>
              </View>
              {isSubscribed ? (
                <>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.subscriptionLabel}>Plan</Text>
                    <Text style={styles.subscriptionValue}>
                      {subscriptionPlan === 'monthly' ? 'Monthly' : 'Yearly'}
                    </Text>
                  </View>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.subscriptionLabel}>Renewal</Text>
                    <Text style={styles.subscriptionValue}>
                      {expiryDate ? new Date(expiryDate).toLocaleDateString() : 'Unknown'}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionLabel}>Usage</Text>
                  <Text style={styles.subscriptionValue}>
                    {remainingConversations > 0
                      ? `${remainingConversations} conversations left`
                      : 'No conversations left'}
                  </Text>
                  {remainingConversations === 0 && (
                    <Text style={styles.resetDateText}>Resets on {getFormattedResetDate()}</Text>
                  )}
                </View>
              )}
            </View>
            {!isSubscribed && (
              <Button
                title="Upgrade to Premium"
                onPress={navigateToPaywall}
                variant="outline"
                leftIcon="star-outline"
                style={styles.button}
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          <View style={styles.card}>
            <Button
              title="Update Password"
              onPress={navigateToUpdatePassword}
              variant="outline"
              leftIcon="lock-closed-outline"
              style={styles.button}
            />
            <Button
              title="Sign Out"
              onPress={handleSignOut}
              variant="primary"
              leftIcon="log-out-outline"
              style={styles.button}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Data</Text>
          <View style={styles.card}>
            <View style={styles.buttonContainer}>
              <Text style={styles.buttonLabel}>Clear all cached recordings and conversation data</Text>
              <Button
                title="Clear Cache"
                variant="outline"
                size="small"
                onPress={() => {}}
                leftIcon="trash-outline"
              />
            </View>
            {__DEV__ && (
              <>
                <View style={[styles.buttonContainer, styles.devContainer]}>
                  <Text style={styles.buttonLabel}>Current Usage: {currentUsage}/{usageLimit}</Text>
                </View>
                <View style={[styles.buttonContainer, styles.devContainer]}>
                  <Text style={styles.buttonLabel}>View paywall (DEV only)</Text>
                  <Button
                    title="View"
                    variant="outline"
                    size="small"
                    onPress={navigateToPaywall}
                    leftIcon="card-outline"
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
