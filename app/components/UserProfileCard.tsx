import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useUserProfile, useSubscriptionStatus } from '../hooks/useApiQueries';

interface UserProfileCardProps {
  onRefresh?: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ onRefresh }) => {
  const { data: profile, isLoading: profileLoading, error: profileError, refetch: refreshProfile } =
    useUserProfile();
  const {
    data: subscriptionStatus,
    isLoading: subStatusLoading,
    error: subStatusError,
  } = useSubscriptionStatus();

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if ((profileLoading || subStatusLoading) && !loadingTimedOut) {
      loadingTimeoutRef.current = setTimeout(() => setLoadingTimedOut(true), 15000);
    } else if (!(profileLoading || subStatusLoading) && loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      setLoadingTimedOut(false);
    }
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, [profileLoading, subStatusLoading, loadingTimedOut]);

  const handleRefresh = () => {
    setLoadingTimedOut(false);
    refreshProfile();
    if (onRefresh) onRefresh();
  };

  if (profileLoading || subStatusLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading profile...</Text>
        {loadingTimedOut && (
          <View style={styles.timeoutContainer}>
            <Text style={styles.timeoutText}>Loading is taking longer than expected.</Text>
            <TouchableOpacity style={styles.button} onPress={handleRefresh}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (profileError || subStatusError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          Error: {profileError?.message || subStatusError?.message || 'Unknown error'}
        </Text>
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
          {subscriptionStatus?.isSubscribed ? (
            <View style={styles.subscriptionActive}>
              <Text style={styles.subscriptionText}>
                {subscriptionStatus.subscription.type === 'monthly' ? 'Monthly' : 'Yearly'}
                {subscriptionStatus.subscription.expiresDate &&
                  ` (Expires: ${new Date(subscriptionStatus.subscription.expiresDate).toLocaleDateString()})`}
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
    marginTop: 12,
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
  timeoutContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  timeoutText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
  },
});