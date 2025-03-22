import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useUser } from '../contexts/UserContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthTokenContext } from '../contexts/AuthTokenContext';

interface UserProfileCardProps {
  onRefresh?: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ 
  onRefresh 
}) => {
  const { profile, isLoading, hasError, errorMessage, refreshProfile } = useUser();
  const { isSubscribed, subscriptionInfo } = useSubscription();
  const { tokenInitialized } = useAuthTokenContext();

  const handleRefresh = () => {
    refreshProfile();
    if (onRefresh) {
      onRefresh();
    }
  };

  // Show initialization status if token is not yet initialized
  if (!tokenInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#6366f1" style={styles.loadingIndicator} />
        <Text style={styles.message}>Initializing authentication...</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Error: {errorMessage}</Text>
        <TouchableOpacity style={styles.button} onPress={handleRefresh}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Not signed in</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{profile.name || 'User'}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.details}>
        <Text style={styles.email}>{profile.email || 'No email'}</Text>
        <View style={styles.subscriptionContainer}>
          <Text style={styles.label}>Subscription:</Text>
          {isSubscribed ? (
            <View style={styles.subscriptionActive}>
              <Text style={styles.subscriptionText}>
                {subscriptionInfo?.type === 'monthly' ? 'Monthly' : 'Yearly'} 
                {subscriptionInfo?.expiryDate && ` (Expires: ${new Date(subscriptionInfo.expiryDate).toLocaleDateString()})`}
              </Text>
            </View>
          ) : (
            <View style={styles.subscriptionInactive}>
              <Text style={styles.subscriptionText}>Not subscribed</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  details: {
    marginTop: 8,
    width: '100%',
  },
  email: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 12,
  },
  error: {
    fontSize: 14,
    color: '#ef4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
  },
  refreshText: {
    fontSize: 12,
    color: '#4b5563',
  },
  subscriptionContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#4b5563',
    marginRight: 8,
  },
  subscriptionActive: {
    backgroundColor: '#dcfce7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  subscriptionInactive: {
    backgroundColor: '#fee2e2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  subscriptionText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '500',
  },
  loadingIndicator: {
    marginBottom: 8,
  },
}); 