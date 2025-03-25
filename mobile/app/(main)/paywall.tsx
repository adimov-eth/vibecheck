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
    error: subscriptionError,
  } = useSubscription();

  const { 
    usageStats: usageData,
    isLoading: usageLoading,
    error: usageError,
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
    try {
      // Get Android-specific offer token if available
      const product = Platform.OS === 'android' 
        ? subscriptionProducts.find(p => p.productId === selectedPlan) 
        : null;
      const offerToken = product?.subscriptionOfferDetails?.[0]?.offerToken;
      
      // Attempt purchase
      await purchase(selectedPlan, offerToken);
    } catch (err) {
      console.error('Purchase error:', err);
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restore();
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
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
            onPress={() => router.replace('/home')}
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

  // Error state
  if (subscriptionError || usageError) {
    const errorMessage = subscriptionError instanceof Error 
      ? subscriptionError.message 
      : usageError instanceof Error 
        ? usageError.message 
        : 'Failed to load subscription details';

    return (
      <Container withSafeArea>
        <AppBar 
          title="Premium Subscription" 
          showBackButton
          onBackPress={handleGoBack}
        />
        <View style={localStyles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={localStyles.errorText}>{errorMessage}</Text>
          <Button
            title="Try Again"
            variant="primary"
            onPress={() => router.replace('/paywall')}
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
      
      <ScrollView style={localStyles.scrollView}>
        {/* Hero section */}
        <View style={localStyles.heroSection}>
          <View style={localStyles.heroIconContainer}>
            <Ionicons name="star" size={80} color="#FFD700" />
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
              <Text style={localStyles.usageStatLabel}>Current Usage</Text>
              <Text style={localStyles.usageStatValue}>
                {usageData ? `${usageData.totalMinutes}/${usageData.totalMinutes + usageData.remainingMinutes}` : '0/0'}
              </Text>
            </View>
            
            <View style={localStyles.usageStat}>
              <Text style={localStyles.usageStatLabel}>Remaining</Text>
              <Text style={[
                localStyles.usageStatValue,
                (!usageData?.remainingMinutes) && localStyles.usageStatValueZero
              ]}>
                {usageData?.remainingMinutes || 0}
              </Text>
            </View>
          </View>
        </Card>
        
        {/* Features section */}
        <View style={localStyles.featuresSection}>
          <Text style={localStyles.sectionTitle}>Premium Features</Text>
          
          {renderFeatureItem(
            "infinite", 
            "Unlimited Conversations", 
            "Create as many conversations as you need without monthly limits"
          )}
          
          {renderFeatureItem(
            "analytics", 
            "Advanced Analysis", 
            "Get deeper insights with more detailed conversation analytics"
          )}
          
          {renderFeatureItem(
            "cloud-upload", 
            "Cloud Storage", 
            "Save all your conversations and access them from any device"
          )}
          
          {renderFeatureItem(
            "sparkles", 
            "Priority Support", 
            "Get faster responses and dedicated assistance when you need help"
          )}
        </View>
        
        {/* Plans section */}
        <View style={localStyles.plansSection}>
          <Text style={localStyles.sectionTitle}>Choose Your Plan</Text>
          
          {subscriptionProducts.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={localStyles.loader} />
          ) : (
            subscriptionProducts.map((product) => (
              <TouchableOpacity
                key={product.productId}
                style={[
                  localStyles.planCard,
                  selectedPlan === product.productId && localStyles.selectedPlan
                ]}
                onPress={() => setSelectedPlan(product.productId)}
              >
                {product.productId === SUBSCRIPTION_SKUS.YEARLY && (
                  <View style={localStyles.bestValueBadge}>
                    <Text style={localStyles.bestValueText}>BEST VALUE</Text>
                  </View>
                )}
                
                <View style={localStyles.planHeader}>
                  <Text style={localStyles.planTitle}>
                    {product.title.replace('(VibeCheck)', '')}
                  </Text>
                  
                  <View style={localStyles.priceContainer}>
                    <Text style={localStyles.priceText}>{product.price}</Text>
                    <Text style={localStyles.periodText}>
                      {product.productId === SUBSCRIPTION_SKUS.MONTHLY ? '/month' : '/year'}
                    </Text>
                  </View>
                </View>
                
                <Text style={localStyles.planDescription}>{product.description}</Text>
                
                <View style={[
                  localStyles.radioButton,
                  selectedPlan === product.productId && localStyles.radioButtonSelected
                ]} />
              </TouchableOpacity>
            ))
          )}
        </View>
        
        {/* Action buttons */}
        <View style={localStyles.actionsContainer}>
          <Button
            title="Subscribe Now"
            variant="primary"
            onPress={handlePurchase}
            disabled={!selectedPlan || isPurchasing}
            loading={isPurchasing}
          />
          
          <Button
            title="Restore Purchases"
            variant="outline"
            onPress={handleRestore}
            disabled={isRestoring}
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

const localStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  successIconContainer: {
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...typography.heading1,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  successMessage: {
    ...typography.body1,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  heroSection: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  heroIconContainer: {
    marginBottom: spacing.md,
  },
  heroTitle: {
    ...typography.heading1,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.body1,
    textAlign: 'center',
    color: colors.mediumText,
  },
  usageCard: {
    margin: spacing.lg,
  },
  usageStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: spacing.md,
  },
  usageStat: {
    alignItems: 'center',
  },
  usageStatLabel: {
    ...typography.caption,
    color: colors.mediumText,
    marginBottom: spacing.xs,
  },
  usageStatValue: {
    ...typography.heading2,
  },
  usageStatValueZero: {
    color: colors.error,
  },
  featuresSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading2,
    marginBottom: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.heading3,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    ...typography.body2,
    color: colors.mediumText,
  },
  plansSection: {
    padding: spacing.lg,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  planCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedPlan: {
    borderColor: colors.primary,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  bestValueText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: 'bold',
  },
  planHeader: {
    marginBottom: spacing.md,
  },
  planTitle: {
    ...typography.heading3,
    marginBottom: spacing.xs,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceText: {
    ...typography.heading2,
    color: colors.primary,
  },
  periodText: {
    ...typography.body2,
    color: colors.mediumText,
    marginLeft: spacing.xs,
  },
  planDescription: {
    ...typography.body2,
    color: colors.mediumText,
    marginBottom: spacing.md,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  actionsContainer: {
    padding: spacing.lg,
  },
  restoreButton: {
    marginTop: spacing.md,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.lightText,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body1,
    color: colors.mediumText,
    marginTop: spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});