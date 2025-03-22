import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useApi, UsageStats } from '../hooks/useAPI';
import { useSubscription } from './SubscriptionContext';
import { router } from 'expo-router';
import { Alert } from 'react-native';

interface UsageContextType {
  usageStats: UsageStats | null;
  isLoading: boolean;
  error: Error | null;
  refreshUsage: () => Promise<void>;
  checkCanCreateConversation: (showPaywallOnLimit?: boolean) => Promise<boolean>;
  remainingConversationsText: string;
}

const defaultUsageStats: UsageStats = {
  currentUsage: 0,
  limit: 10,
  isSubscribed: false,
  remainingConversations: 10,
  resetDate: null
};

const UsageContext = createContext<UsageContextType>({
  usageStats: defaultUsageStats,
  isLoading: false,
  error: null,
  refreshUsage: async () => {},
  checkCanCreateConversation: async () => true,
  remainingConversationsText: '',
});

export const UsageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { getUserUsageStats } = useApi();
  const { isSubscribed } = useSubscription();
  
  // Fetch usage stats on mount and when subscription changes
  useEffect(() => {
    refreshUsage();
  }, [isSubscribed]);
  
  // Function to refresh usage stats
  const refreshUsage = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const stats = await getUserUsageStats();
      setUsageStats(stats);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage stats:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch usage stats'));
    } finally {
      setIsLoading(false);
    }
  }, [getUserUsageStats]);
  
  // Format remaining conversations text
  const remainingConversationsText = usageStats 
    ? usageStats.isSubscribed 
      ? 'Unlimited' 
      : usageStats.remainingConversations > 0 
        ? `${usageStats.remainingConversations} left this month` 
        : 'No free conversations left'
    : '';

  // Check if user can create a conversation, optionally showing paywall if not
  const checkCanCreateConversation = useCallback(async (showPaywallOnLimit = true): Promise<boolean> => {
    // If we don't have usage stats yet, fetch them
    if (!usageStats) {
      await refreshUsage();
    }
    
    // If user is subscribed, they can always create conversations
    if (usageStats?.isSubscribed) {
      return true;
    }
    
    // Check if user has remaining conversations
    const canCreate = usageStats?.remainingConversations ? usageStats.remainingConversations > 0 : false;
    
    // If user cannot create more conversations, show paywall or alert
    if (!canCreate && showPaywallOnLimit) {
      const resetDate = usageStats?.resetDate 
        ? new Date(usageStats.resetDate).toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric' 
          }) 
        : 'next month';
        
      Alert.alert(
        'Free Limit Reached',
        `You've used all your free conversations for this month. Subscribe to Premium for unlimited conversations or wait until ${resetDate} for your free limit to reset.`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Subscribe',
            onPress: () => {
              router.push('/paywall' as any);
            }
          }
        ]
      );
    }
    
    return canCreate;
  }, [usageStats, refreshUsage]);
  
  return (
    <UsageContext.Provider value={{
      usageStats,
      isLoading,
      error,
      refreshUsage,
      checkCanCreateConversation,
      remainingConversationsText
    }}>
      {children}
    </UsageContext.Provider>
  );
};

export const useUsage = () => useContext(UsageContext); 