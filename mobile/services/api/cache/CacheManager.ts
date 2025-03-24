import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CacheEntry } from "../types";

export class CacheManager {
  private readonly prefix: string;
  private readonly maxAge: number;

  constructor(prefix = "api_cache:", maxAge = 5 * 60 * 1000) {
    this.prefix = prefix;
    this.maxAge = maxAge;
  }

  private getCacheKey(endpoint: string, params?: Record<string, unknown>): string {
    return `${this.prefix}${endpoint}:${JSON.stringify(params || {})}`;
  }

  async set<T>(
    endpoint: string,
    data: T,
    params?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(endpoint, params);
      const cacheData: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error("Error caching response:", error);
    }
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(endpoint, params);
      const cachedJson = await AsyncStorage.getItem(cacheKey);

      if (cachedJson) {
        const cached = JSON.parse(cachedJson) as CacheEntry<T>;
        const now = Date.now();

        if (now - cached.timestamp < this.maxAge) {
          return cached.data;
        }
      }
    } catch (error) {
      console.error("Error getting cached response:", error);
    }

    return null;
  }

  async remove(endpoint: string, params?: Record<string, unknown>): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(endpoint, params);
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error("Error removing cached response:", error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith(this.prefix));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }
}
