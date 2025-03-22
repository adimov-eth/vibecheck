import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useApi } from './useAPI';
import { useState, useEffect } from 'react';
import { useApiClient } from '../utils/apiClient';
import { UsageStats } from '../types/api';
import { UserProfile } from '../types/user';
import { SubscriptionStatus } from './useAPI';

// Common React Query configurations
const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
const DEFAULT_GCTIME = 1000 * 60 * 30; // 30 minutes (previously cacheTime)

// Usage stats specific configurations
const USAGE_STALE_TIME = 1000 * 60 * 2; // 2 minutes
const USAGE_RETRY_DELAY = (attempt: number) => Math.min(1000 * 2 ** attempt, 30000); // Exponential backoff with max 30s delay

export const useUserProfile = (options?: UseQueryOptions<UserProfile, Error>) => {
  const { getUserProfile } = useApi();
  return useQuery<UserProfile, Error>({
    queryKey: ['userProfile'],
    queryFn: getUserProfile,
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GCTIME,
    retry: 3,
    ...options,
  });
};

export const useSubscriptionStatus = (options?: UseQueryOptions<SubscriptionStatus, Error>) => {
  const { getSubscriptionStatus } = useApi();
  return useQuery<SubscriptionStatus, Error>({
    queryKey: ['subscriptionStatus'],
    queryFn: getSubscriptionStatus,
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GCTIME,
    retry: 3,
    ...options,
  });
};

export const useUsageStats = (options?: UseQueryOptions<UsageStats, Error>) => {
  const { getUserUsageStats } = useApi();
  return useQuery<UsageStats, Error>({
    queryKey: ['usageStats'],
    queryFn: async () => {
      const data = await getUserUsageStats();
      // Convert API UsageStats to UI UsageStats format
      return {
        ...data,
        resetDate: data.resetDate ? data.resetDate.toISOString() : undefined,
      } as UsageStats;
    },
    staleTime: USAGE_STALE_TIME,
    gcTime: DEFAULT_GCTIME,
    retry: 3,
    retryDelay: USAGE_RETRY_DELAY,
    ...options,
  });
};

/**
 * Alternative implementation of useUsageStats that uses the apiClient directly
 * to ensure compatibility with the mode/[id].tsx component
 */
export function useUsageStatsV2() {
  const { request } = useApiClient();
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
        const response = await request('/usage/stats');
        setData(response.usage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch usage stats');
      } finally {
        setIsLoading(false);
      }
    }
    fetchUsage();
  }, [request]);

  return { data, isLoading, error };
}