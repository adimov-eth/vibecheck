import { AppBar } from '@/components/layout/AppBar';
import { Button } from '@/components/ui/Button';
import { colors, layout, spacing, typography } from '@/constants/styles';
import { useUsage } from '@/hooks/useUsage';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

export default function Profile() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { 
    subscriptionStatus,
    usageStats,
    loading,
    error,
    loadData 
  } = useUsage();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Only fetch if we don't have the data already
        if (!subscriptionStatus || !usageStats) {
          await Promise.all([
            loadData()
          ]);
        }
      } catch (err) {
        console.error('[Profile] Failed to fetch data:', err);
      }
    };
    
    fetchData();
  }, []); // Only run on mount

  const handleBackPress = () => router.back();
  const handleSignOut = async () => await signOut();
  const navigateToUpdatePassword = () => router.push('./update-password');
  const navigateToPaywall = () => router.push('./paywall');

  const isSubscribed = subscriptionStatus?.isActive ?? false;
  const subscriptionPlan = subscriptionStatus?.type ?? 'none';
  const expiryDate = subscriptionStatus?.expiresDate;
  const remainingConversations = usageStats?.remainingConversations ?? 0;
  const currentUsage = usageStats?.currentUsage || 0;
  const usageLimit = usageStats ? 
    (usageStats.currentUsage + usageStats.remainingConversations) : 0;
  
  // Format the reset date based on the subscription expiry date
  const getFormattedResetDate = () => {
    if (!expiryDate) return 'Unknown';
    
    const now = new Date();
    const expiry = new Date(expiryDate);
    
    // If expired, show as "Unknown"
    if (expiry < now) {
      return 'Unknown';
    }
    
    // Format the expiry date
    return expiry.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppBar 
          title="Profile" 
          showBackButton={true} 
          onBackPress={handleBackPress} 
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppBar 
          title="Profile" 
          showBackButton={true} 
          onBackPress={handleBackPress} 
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error.message || 'Failed to load profile data'}</Text>
          <Button 
            title="Retry" 
            variant="primary"
            onPress={() => router.replace('/profile')}
            style={styles.retryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

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
    backgroundColor: colors.background.primary,
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  } as ViewStyle,
  contentContainer: {
    padding: spacing.lg,
  } as ViewStyle,
  profileHeader: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  } as ViewStyle,
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...layout.shadows.small,
  } as ViewStyle,
  avatarText: {
    fontSize: 32,
    color: colors.text.inverse,
    fontFamily: 'Inter-Bold',
  } as TextStyle,
  userName: {
    ...typography.heading2,
    marginBottom: spacing.xs,
  } as TextStyle,
  userEmail: {
    ...typography.body1,
    color: colors.text.secondary,
  } as TextStyle,
  section: {
    marginBottom: spacing.xl,
  } as ViewStyle,
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  } as TextStyle,
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: layout.borderRadius.lg,
    padding: spacing.lg,
    ...layout.shadows.small,
  } as ViewStyle,
  button: {
    marginBottom: spacing.md,
  } as ViewStyle,
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  } as ViewStyle,
  buttonLabel: {
    ...typography.body2,
    flex: 1,
    marginRight: spacing.md,
  } as TextStyle,
  subscriptionStatusContainer: {
    marginBottom: spacing.lg,
  } as ViewStyle,
  subscriptionInfo: {
    marginBottom: spacing.md,
  } as ViewStyle,
  subscriptionLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  } as TextStyle,
  subscriptionStatus: {
    ...typography.heading3,
    fontWeight: '600',
  } as TextStyle,
  statusPremium: {
    color: colors.status.success,
  } as TextStyle,
  statusFree: {
    color: colors.primary,
  } as TextStyle,
  subscriptionValue: {
    ...typography.body1,
  } as TextStyle,
  resetDateText: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  } as TextStyle,
  devContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  } as ViewStyle,
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  loadingText: {
    ...typography.body1,
    color: colors.text.secondary,
    marginTop: spacing.md,
  } as TextStyle,
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  } as ViewStyle,
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  } as TextStyle,
  retryButton: {
    minWidth: 120,
  } as ViewStyle,
});
