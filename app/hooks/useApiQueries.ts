import { useQuery } from '@tanstack/react-query';
import { useApi } from './useAPI';
import { useState, useEffect } from 'react';
import { useApiClient } from '../utils/apiClient';

export const useUserProfile = () => {
  const { getUserProfile } = useApi();
  return useQuery({
    queryKey: ['userProfile'],
    queryFn: getUserProfile,
  });
};

export const useSubscriptionStatus = () => {
  const { getSubscriptionStatus } = useApi();
  return useQuery({
    queryKey: ['subscriptionStatus'],
    queryFn: getSubscriptionStatus,
  });
};

export const useUsageStats = () => {
  const { getUserUsageStats } = useApi();
  return useQuery({
    queryKey: ['usageStats'],
    queryFn: getUserUsageStats,
  });
};



/**
 * Alternative implementation of useUsageStats that uses the apiClient directly
 * to ensure compatibility with the mode/[id].tsx component
 */
export function useUsageStatsV2() {
  const { get } = useApiClient();
  const [data, setData] = useState<{
    currentUsage: number;
    limit: number;
    isSubscribed: boolean;
    remainingConversations: number;
    resetDate: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        setIsLoading(true);
        const response = await get('/usage/stats');
        setData(response.usage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch usage stats');
      } finally {
        setIsLoading(false);
      }
    }
    fetchUsage();
  }, [get]);

  return { data, isLoading, error };
}