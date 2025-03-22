import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useSubscription, SUBSCRIPTION_SKUS } from '../../contexts/SubscriptionContext';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const PaywallScreen: React.FC = () => {
  const {
    subscriptionProducts,
    isLoading,
    error,
    purchaseSubscription,
    restorePurchases,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  // Select default plan on load (yearly if available)
  useEffect(() => {
    if (subscriptionProducts.length > 0) {
      const yearlyPlan = subscriptionProducts.find(
        (sub) => sub.productId === SUBSCRIPTION_SKUS.YEARLY
      );

      if (yearlyPlan) {
        setSelectedPlan(yearlyPlan.productId);
      } else if (subscriptionProducts.length > 0) {
        setSelectedPlan(subscriptionProducts[0].productId);
      }
    }
  }, [subscriptionProducts]);

  const handlePurchase = async () => {
    if (!selectedPlan) return;

    setIsPurchasing(true);

    try {
      // For Android with subscription offers
      if (Platform.OS === 'android') {
        const product = subscriptionProducts.find((p) => p.productId === selectedPlan);

        if (product?.subscriptionOfferDetails?.[0]?.offerToken) {
          const offerToken = product.subscriptionOfferDetails[0].offerToken;
          await purchaseSubscription(selectedPlan, offerToken);
        } else {
          await purchaseSubscription(selectedPlan);
        }
      } else {
        // For iOS
        await purchaseSubscription(selectedPlan);
      }
    } catch (err) {
      console.error('Purchase error:', err);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);

    try {
      await restorePurchases();
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium Subscription</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <Ionicons name="star" size={80} color="#FFD700" />
          </View>
          <Text style={styles.heroTitle}>Upgrade to Premium</Text>
          <Text style={styles.heroSubtitle}>
            Unlock all premium features and enhance your experience
          </Text>
        </View>

        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          
          <View style={styles.featureItem}>
            <View style={styles.featureIconContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Unlimited Recordings</Text>
              <Text style={styles.featureDescription}>
                Record as many sessions as you need without limitations
              </Text>
            </View>
          </View>
          
          <View style={styles.featureItem}>
            <View style={styles.featureIconContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Enhanced Analysis</Text>
              <Text style={styles.featureDescription}>
                Get detailed insights and advanced analytics
              </Text>
            </View>
          </View>
          
          <View style={styles.featureItem}>
            <View style={styles.featureIconContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Priority Support</Text>
              <Text style={styles.featureDescription}>
                Get faster responses and dedicated support
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.plansSection}>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          
          {isLoading ? (
            <ActivityIndicator size="large" color="#2196F3" style={styles.loader} />
          ) : error ? (
            <Text style={styles.errorText}>
              Failed to load subscription options. Please try again.
            </Text>
          ) : (
            subscriptionProducts.map((product) => (
              <TouchableOpacity
                key={product.productId}
                style={[
                  styles.planCard,
                  selectedPlan === product.productId && styles.selectedPlan,
                ]}
                onPress={() => setSelectedPlan(product.productId)}
              >
                {product.productId === SUBSCRIPTION_SKUS.YEARLY && (
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </View>
                )}
                
                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>
                    {product.title.replace('(VibeCheck)', '')}
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.priceText}>{product.localizedPrice}</Text>
                    <Text style={styles.periodText}>
                      {product.productId === SUBSCRIPTION_SKUS.MONTHLY 
                        ? '/month' 
                        : '/year'}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.planDescription}>{product.description}</Text>
                
                <View 
                  style={[
                    styles.radioButton,
                    selectedPlan === product.productId && styles.radioButtonSelected,
                  ]}
                />
              </TouchableOpacity>
            ))
          )}
        </View>
        
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.subscribeButton,
              !selectedPlan && styles.disabledButton,
              isPurchasing && styles.loadingButton,
            ]}
            onPress={handlePurchase}
            disabled={!selectedPlan || isPurchasing}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.subscribeButtonText}>
                Subscribe Now
              </Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.restoreButton, isRestoring && styles.loadingButton]}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator color="#2196F3" size="small" />
            ) : (
              <Text style={styles.restoreButtonText}>
                Restore Purchases
              </Text>
            )}
          </TouchableOpacity>
        </View>
        
        <Text style={styles.disclaimer}>
          Payment will be charged to your Apple ID account at the confirmation of purchase. 
          Subscription automatically renews unless it is canceled at least 24 hours before the 
          end of the current period. Your account will be charged for renewal within 24 hours 
          prior to the end of the current period. You can manage and cancel your subscriptions 
          by going to your account settings on the App Store after purchase.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    alignItems: 'center',
    padding: 24,
  },
  heroIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  featuresSection: {
    padding: 24,
    backgroundColor: '#f9f9f9',
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  featureIconContainer: {
    width: 40,
    alignItems: 'center',
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
  plansSection: {
    padding: 24,
  },
  planCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 16,
    marginBottom: 16,
    position: 'relative',
  },
  selectedPlan: {
    borderColor: '#2196F3',
    backgroundColor: 'rgba(33, 150, 243, 0.05)',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  periodText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 2,
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  radioButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#999',
  },
  radioButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#2196F3',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bestValueText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionsContainer: {
    padding: 24,
  },
  subscribeButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restoreButton: {
    borderWidth: 1,
    borderColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  loadingButton: {
    opacity: 0.7,
  },
  disclaimer: {
    padding: 24,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  loader: {
    marginVertical: 32,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginVertical: 16,
  },
});

export default PaywallScreen; 