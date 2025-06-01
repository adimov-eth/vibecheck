// /Users/adimov/Developer/final/vibe/app/(main)/paywall.tsx
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing, typography } from '@/constants/styles';
import { useSubscription } from '@/hooks/useSubscription';
import { useUsage } from '@/hooks/useUsage';
import { SUBSCRIPTION_SKUS } from '@/state/slices/subscriptionSlice';
import { Ionicons } from '@expo/vector-icons';
import type { Ionicons as IoniconsType } from '@expo/vector-icons/build/Icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export default function Paywall() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  const {
    isSubscribed,
    subscriptionProducts,
    purchase,
    restore,
    isLoading: subscriptionLoading,
    error: subscriptionError, // error is string | null
  } = useSubscription();

  const {
    usageStats: usageData,
    loading: usageLoading,
    error: usageError, // error is string | null
  } = useUsage();

  // Select yearly plan by default when products load
  useEffect(() => {
    if (subscriptionProducts.length > 0 && !selectedPlan) {
      const yearlyPlan = subscriptionProducts.find(
        (product) => product.productId === SUBSCRIPTION_SKUS.YEARLY
      );
      setSelectedPlan(yearlyPlan?.productId || subscriptionProducts[0]?.productId);
    }
  }, [subscriptionProducts, selectedPlan]);

  // If user becomes subscribed after a purchase, show success
  useEffect(() => {
    if (isSubscribed && isPurchasing) {
      setPurchaseSuccess(true);
      setIsPurchasing(false);
    }
  }, [isSubscribed, isPurchasing]);

  const handlePurchase = async () => {
    if (!selectedPlan) return;

    setIsPurchasing(true);
    setPurchaseSuccess(false); // Reset success state
    try {
      const product = Platform.OS === 'android'
        ? subscriptionProducts.find(p => p.productId === selectedPlan)
        : null;
      const offerToken = product?.subscriptionOfferDetails?.[0]?.offerToken;

      await purchase(selectedPlan, offerToken);
      // Success is handled by the useEffect watching isSubscribed
    } catch (err) {
      console.error('Purchase initiation error:', err);
      // Error display is handled by the useSubscription hook's error state if it's set there
      // Or show a generic toast/alert here if needed for immediate feedback
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restore();
      // Restore success might implicitly update isSubscribed via listeners,
      // or you might want to show a success toast here.
    } catch (err) {
      console.error('Restore error:', err);
      // Error display is handled by the useSubscription hook's error state
    } finally {
      setIsRestoring(false);
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(main)/home'); // Ensure correct home route
    }
  };

  // Success view shown after successful purchase
  if (purchaseSuccess) {
    return (
      <Container withSafeArea>
        <View style={localStyles.successContainer}>
          <View style={localStyles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>

          <Text style={localStyles.successTitle}>Subscription Activated!</Text>

          <Text style={localStyles.successMessage}>
            Thank you for subscribing to VibeCheck Premium. You now have unlimited access to all features.
          </Text>

          <Button
            title="Continue to App"
            variant="primary"
            onPress={() => router.replace('/(main)/home')} // Ensure correct home route
          />
        </View>
      </Container>
    );
  }

  // Loading state
  if (subscriptionLoading || usageLoading) {
    return (
      <Container withSafeArea>
        <AppBar
          title="Premium Subscription"
          showBackButton
          onBackPress={handleGoBack}
        />
        <View style={localStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={localStyles.loadingText}>Loading subscription details...</Text>
        </View>
      </Container>
    );
  }

  // Error state - Combine errors from both hooks
  const combinedError = subscriptionError || usageError;
  if (combinedError) {
    // Display the error string directly
    const errorMessage = combinedError || 'Failed to load subscription details';

    return (
      <Container withSafeArea>
        <AppBar
          title="Premium Subscription"
          showBackButton
          onBackPress={handleGoBack}
        />
        <View style={localStyles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={localStyles.errorText}>{errorMessage instanceof Error ? errorMessage.message : errorMessage}</Text>
          <Button
            title="Try Again"
            variant="primary"
            // Reload the paywall route itself to retry initialization
            onPress={() => router.replace('/(main)/paywall')}
            style={localStyles.retryButton} // Added style
          />
           <Button
            title="Go Back"
            variant="outline"
            onPress={handleGoBack}
            style={localStyles.goBackButton} // Added style
          />
        </View>
      </Container>
    );
  }

  const renderFeatureItem = (iconName: keyof typeof IoniconsType.glyphMap, title: string, description: string) => (
    <View style={localStyles.featureItem}>
      <View style={localStyles.featureIcon}>
        <Ionicons name={iconName} size={24} color={colors.primary} />
      </View>
      <View style={localStyles.featureContent}>
        <Text style={localStyles.featureTitle}>{title}</Text>
        <Text style={localStyles.featureDescription}>{description}</Text>
      </View>
    </View>
  );

  return (
    <Container withSafeArea>
      <AppBar
        title="Premium Subscription"
        showBackButton
        onBackPress={handleGoBack}
      />

      <ScrollView style={localStyles.scrollView} contentContainerStyle={localStyles.scrollContent}>
        {/* Hero section */}
        <View style={localStyles.heroSection}>
          <View style={localStyles.heroIconContainer}>
            {/* Changed icon for better visual */}
            <Ionicons name="diamond-outline" size={80} color={colors.primary} />
          </View>
          <Text style={localStyles.heroTitle}>Upgrade to Premium</Text>
          <Text style={localStyles.heroSubtitle}>
            Unlock unlimited conversations and premium features
          </Text>
        </View>

        {/* Usage stats */}
        <Card style={localStyles.usageCard}>
          <View style={localStyles.usageStatsContainer}>
            <View style={localStyles.usageStat}>
              <Text style={localStyles.usageStatLabel}>
                {usageData?.isSubscribed ? 'Subscription' : 'Current Usage'}
              </Text>
              <Text style={localStyles.usageStatValue}>
                {usageData?.isSubscribed
                  ? 'Active'
                  : (usageData ? `${usageData.currentUsage}/${usageData.limit}` : '0/0')}
              </Text>
            </View>

            <View style={localStyles.usageStat}>
              <Text style={localStyles.usageStatLabel}>
                {usageData?.isSubscribed ? 'Access' : 'Remaining'}
              </Text>
              <Text style={[
                localStyles.usageStatValue,
                (!usageData?.isSubscribed && usageData?.remainingConversations === 0) && localStyles.usageStatValueZero
              ]}>
                {usageData?.isSubscribed
                  ? 'Unlimited'
                  : (usageData?.remainingConversations ?? 0)} {/* Use nullish coalescing */}
              </Text>
            </View>
          </View>
        </Card>

        {/* Features section */}
        <View style={localStyles.featuresSection}>
          <Text style={localStyles.sectionTitle}>Premium Features</Text>

          {renderFeatureItem(
            "infinite-outline",
            "Unlimited Conversations",
            "Create as many conversations as you need without monthly limits"
          )}

          {renderFeatureItem(
            "analytics-outline",
            "Advanced Analysis",
            "Get deeper insights with more detailed conversation analytics"
          )}

          {renderFeatureItem(
            "cloud-upload-outline",
            "Cloud Storage",
            "Save all your conversations and access them from any device"
          )}

          {renderFeatureItem(
            "sparkles-outline",
            "Priority Support",
            "Get faster responses and dedicated assistance when you need help"
          )}
        </View>

        {/* Plans section */}
        <View style={localStyles.plansSection}>
          <Text style={localStyles.sectionTitle}>Choose Your Plan</Text>

          {subscriptionProducts.length === 0 && !subscriptionLoading ? (
             <Text style={localStyles.noProductsText}>Subscription plans not available at the moment. Please try again later.</Text>
          ) : (
            subscriptionProducts.map((product) => (
              <TouchableOpacity
                key={product.productId}
                style={[
                  localStyles.planCard,
                  selectedPlan === product.productId && localStyles.selectedPlan
                ]}
                onPress={() => setSelectedPlan(product.productId)}
                disabled={isPurchasing || isRestoring} // Disable selection during actions
              >
                {product.productId === SUBSCRIPTION_SKUS.YEARLY && (
                  <View style={localStyles.bestValueBadge}>
                    <Text style={localStyles.bestValueText}>BEST VALUE</Text>
                  </View>
                )}

                <View style={localStyles.planHeader}>
                  <Text style={localStyles.planTitle}>
                    {/* Basic cleanup of common IAP title additions */}
                    {product.title.replace(/\(.*\)/, '').trim()}
                  </Text>

                  <View style={localStyles.priceContainer}>
                    <Text style={localStyles.priceText}>{product.price}</Text>
                    <Text style={localStyles.periodText}>
                      {product.productId === SUBSCRIPTION_SKUS.MONTHLY ? '/month' : '/year'}
                    </Text>
                  </View>
                </View>

                {/* Use description if available, otherwise generate one */}
                <Text style={localStyles.planDescription}>
                    {product.description || (product.productId === SUBSCRIPTION_SKUS.MONTHLY ? 'Billed monthly' : 'Billed annually')}
                </Text>

                {/* Radio button visual */}
                 <View style={localStyles.radioOuter}>
                    {selectedPlan === product.productId && <View style={localStyles.radioInner} />}
                 </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Action buttons */}
        <View style={localStyles.actionsContainer}>
          <Button
            title="Subscribe Now"
            variant="primary"
            size="large" // Make main button larger
            onPress={handlePurchase}
            disabled={!selectedPlan || isPurchasing || isRestoring || subscriptionProducts.length === 0}
            loading={isPurchasing}
          />

          <Button
            title="Restore Purchases"
            variant="outline"
            onPress={handleRestore}
            disabled={isRestoring || isPurchasing}
            loading={isRestoring}
            style={localStyles.restoreButton}
          />
        </View>

        <Text style={localStyles.disclaimer}>
          Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account
          at confirmation of purchase. Subscription automatically renews unless auto-renew is turned off
          at least 24-hours before the end of the current period. Your account will be charged for renewal
          within 24-hours prior to the end of the current period. You can manage and cancel your
          subscriptions by going to your account settings after purchase.
        </Text>
      </ScrollView>
    </Container>
  );
}

// Renamed styles to avoid conflicts if imported elsewhere
const localStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl, // Ensure space at the bottom
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl, // Increased padding
  },
  successIconContainer: {
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...typography.heading1,
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.text.primary,
  },
  successMessage: {
    ...typography.body1,
    textAlign: 'center',
    marginBottom: spacing.xl,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryLight, // Light background for hero
  },
  heroIconContainer: {
    marginBottom: spacing.md,
  },
  heroTitle: {
    ...typography.heading1,
    marginBottom: spacing.sm,
    textAlign: 'center',
    color: colors.primaryDark,
  },
  heroSubtitle: {
    ...typography.body1,
    textAlign: 'center',
    color: colors.text.secondary,
  },
  usageCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg, // Add top margin
    marginBottom: spacing.lg,
  },
  usageStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md, // Adjusted padding
  },
  usageStat: {
    alignItems: 'center',
  },
  usageStatLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase', // Make labels stand out
  },
  usageStatValue: {
    ...typography.heading2,
    color: colors.text.primary,
  },
  usageStatValueZero: {
    color: colors.error,
  },
  featuresSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg, // Add vertical padding
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading2,
    marginBottom: spacing.lg,
    textAlign: 'center', // Center section titles
    color: colors.text.primary,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: spacing.lg, // Increased spacing
    alignItems: 'center', // Center items vertically
  },
  featureIcon: {
    width: 44, // Slightly larger icon background
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.heading3, // Use heading 3 for feature titles
    fontSize: 18, // Adjust size
    marginBottom: spacing.xs,
    color: colors.text.primary,
  },
  featureDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  plansSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg, // Add bottom padding
  },
  noProductsText: {
    ...typography.body1,
    color: colors.text.secondary,
    textAlign: 'center',
    marginVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.border, // Default border
    flexDirection: 'row', // Align items horizontally
    alignItems: 'center', // Center items vertically
    position: 'relative', // For badge positioning
  },
  selectedPlan: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight, // Highlight selected plan background
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10, // Adjust position
    right: spacing.md,
    backgroundColor: colors.accent, // Use accent color
    paddingHorizontal: spacing.sm,
    paddingVertical: 2, // Adjust padding
    borderRadius: 12,
    zIndex: 1, // Ensure badge is on top
  },
  bestValueText: {
    ...typography.caption,
    fontSize: 10, // Smaller badge text
    color: colors.text.inverse,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  planHeader: {
    flex: 1, // Allow header to take available space
    marginRight: spacing.lg, // Space before radio button
  },
  planTitle: {
    ...typography.heading3,
    fontSize: 18, // Adjust size
    marginBottom: spacing.xs,
    color: colors.text.primary,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceText: {
    ...typography.heading2,
    fontSize: 20, // Adjust size
    color: colors.primary,
    fontWeight: 'bold',
  },
  periodText: {
    ...typography.body2,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  planDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    marginTop: spacing.sm, // Add margin top
  },
  radioOuter: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.borderActive,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 'auto', // Push radio to the right
  },
  radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
  },
  actionsContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg, // Add top padding
    paddingBottom: spacing.md,
  },
  restoreButton: {
    marginTop: spacing.md,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.inactive,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body1,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl, // Increased padding
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginVertical: spacing.lg,
    lineHeight: 22,
  },
  retryButton: {
      minWidth: 150, // Make buttons wider
      marginBottom: spacing.md, // Space between buttons
  },
  goBackButton: {
      minWidth: 150,
  },
});