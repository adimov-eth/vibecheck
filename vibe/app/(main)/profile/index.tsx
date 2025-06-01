// /Users/adimov/Developer/final/vibe/app/(main)/profile/index.tsx
import { AppBar } from '@/components/layout/AppBar';
import { AccountSettingsCard } from '@/components/profile/AccountSettingsCard';
import { AppDataCard } from '@/components/profile/AppDataCard';
import { SubscriptionCard } from '@/components/profile/SubscriptionCard';
import { Button } from '@/components/ui/Button';
import { colors, layout, spacing, typography } from '@/constants/styles';
import { useAuthentication } from '@/hooks/useAuthentication';
import { useClearCache } from '@/hooks/useClearCache';
import { useUsage } from '@/hooks/useUsage';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuthentication();
  const { clearCache, isClearing, error: clearError } = useClearCache();
  const { subscriptionStatus, usageStats, loading, error, loadData } = useUsage(); // error is string | null

  useEffect(() => {
    // Load data on initial mount or if data is missing
    if (!subscriptionStatus || !usageStats) {
      loadData();
    }
    // No dependency array means this runs on every render, which might be excessive.
    // Consider adding dependencies if loadData should only run when specific things change,
    // or rely solely on the RefreshControl for manual updates.
    // For now, keeping it simple to load if data is missing.
  }, [subscriptionStatus, usageStats, loadData]); // Added dependencies

  const handleBackPress = () => router.back();
  const handleSignOut = async () => await signOut();
  const navigateToPaywall = () => router.push('/(main)/paywall');

  // Calculate derived values
  const currentUsage = usageStats?.currentUsage ?? 0;
  const remainingConversations = usageStats?.remainingConversations ?? 0;
  // Correctly calculate usageLimit based on whether user is subscribed
  const usageLimit = usageStats
    ? usageStats.isSubscribed
      ? Number.POSITIVE_INFINITY // Or a very large number / null to represent unlimited
      : usageStats.limit
    : 0;

  const ProfileHeader = React.memo(() => (
    <View style={styles.profileHeader}>
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>
          {user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>
      <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">
        {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Vibe User'}
      </Text>
      <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="tail">
        {user?.email || 'No email provided'}
      </Text>
    </View>
  ));

  // Loading state for initial load
  if (loading && !usageStats && !subscriptionStatus) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppBar title="Profile" showBackButton={true} onBackPress={handleBackPress} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state for initial load
  if (error && !usageStats && !subscriptionStatus) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppBar title="Profile" showBackButton={true} onBackPress={handleBackPress} />
        <View style={styles.errorContainer}>
          {/* Display error string directly */}
          <Text style={styles.errorText}>{error || 'Failed to load profile data'}</Text>
          <Button title="Retry" variant="primary" onPress={loadData} style={styles.retryButton}/>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar
        title="Profile"
        showBackButton={true}
        showAvatar={false} // Avatar is shown in the header below
        onBackPress={handleBackPress}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
           <RefreshControl
             refreshing={loading} // Show indicator whenever loading is true (initial or refresh)
             onRefresh={loadData} // Call loadData on pull-to-refresh
             tintColor={colors.primary}
             colors={[colors.primary]} // For Android
           />
        }
       >
        <ProfileHeader />

        {/* Display error inline if it occurs during refresh */}
        {error && ( // Show error even if some data exists (refresh error)
           <View style={styles.inlineErrorContainer}>
              {/* Display error string directly */}
              <Text style={styles.inlineErrorText}>Error refreshing data: {error}</Text>
           </View>
        )}

        <Section title="Subscription">
          <SubscriptionCard
            subscriptionStatus={subscriptionStatus}
            usageStats={usageStats}
            onUpgradePress={navigateToPaywall}
          />
        </Section>

        <Section title="App Data">
          <AppDataCard
            isClearingCache={isClearing}
            onClearCachePress={clearCache}
            clearCacheError={clearError} // Pass the error string
            showDevOptions={__DEV__}
            currentUsage={currentUsage}
            usageLimit={usageLimit} // Pass calculated limit
            onViewPaywallPress={navigateToPaywall}
          />
        </Section>

        <Section title="Account Settings">
          <AccountSettingsCard
            onSignOutPress={handleSignOut}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper component for consistent section styling
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: { flex: 1, backgroundColor: colors.background.primary },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing.xl * 2 }, // Increased bottom padding
  profileHeader: { alignItems: 'center', marginVertical: spacing.lg, paddingHorizontal: spacing.md }, // Added horizontal padding
  avatarContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
    ...layout.shadows.small,
  },
  avatarText: { fontSize: 32, color: colors.text.inverse, fontWeight: '600' }, // Use fontWeight
  userName: { ...typography.heading2, marginBottom: spacing.xs, color: colors.text.primary, textAlign: 'center' },
  userEmail: { ...typography.body1, color: colors.text.secondary, textAlign: 'center' },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.heading3, marginBottom: spacing.md, color: colors.text.primary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body1, color: colors.text.secondary, marginTop: spacing.md },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  errorText: { ...typography.body1, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  retryButton: { minWidth: 120 },
  inlineErrorContainer: {
      backgroundColor: colors.errorLight,
      padding: spacing.md,
      borderRadius: layout.borderRadius.md,
      marginBottom: spacing.lg,
      marginHorizontal: spacing.lg, // Match content padding
  },
  inlineErrorText: {
      ...typography.body2,
      color: colors.error,
      textAlign: 'center',
  },
});