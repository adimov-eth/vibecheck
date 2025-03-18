/**
 * Network utilities tests
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { 
  checkNetworkStatus, 
  isOnline, 
  getCachedNetworkStatus,
  setupNetworkListeners
} from '../../utils/network';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-community/netinfo');
jest.mock('../../utils/error-logger', () => ({
  logError: jest.fn()
}));

describe('Network Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkNetworkStatus', () => {
    it('should return connected status when online', async () => {
      // Mock NetInfo to return connected
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
      
      const result = await checkNetworkStatus();
      expect(result).toBe('connected');
      expect(NetInfo.fetch).toHaveBeenCalled();
    });

    it('should return disconnected status when offline', async () => {
      // Mock NetInfo to return disconnected
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
      
      const result = await checkNetworkStatus();
      expect(result).toBe('disconnected');
      expect(NetInfo.fetch).toHaveBeenCalled();
    });

    it('should handle errors and return unknown status', async () => {
      // Mock NetInfo to throw an error
      (NetInfo.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      const result = await checkNetworkStatus();
      expect(result).toBe('unknown');
      expect(NetInfo.fetch).toHaveBeenCalled();
    });
  });

  describe('isOnline', () => {
    it('should use cached status when available and not forced', async () => {
      // Mock cached status from AsyncStorage
      const cachedStatus = {
        isConnected: true,
        hasInternet: true,
        lastChecked: Date.now() - 30000 // 30 seconds ago (within TTL)
      };
      
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedStatus));
      
      const result = await isOnline(false);
      expect(result).toBe(true);
      expect(AsyncStorage.getItem).toHaveBeenCalled();
      // NetInfo.fetch should not be called when using cache
      expect(NetInfo.fetch).not.toHaveBeenCalled();
    });

    it('should check network status when cache is stale', async () => {
      // Mock stale cached status from AsyncStorage
      const cachedStatus = {
        isConnected: true,
        hasInternet: true,
        lastChecked: Date.now() - 120000 // 2 minutes ago (outside TTL)
      };
      
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedStatus));
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ 
        isConnected: false, 
        isInternetReachable: false 
      });
      
      const result = await isOnline(false);
      expect(result).toBe(false);
      expect(AsyncStorage.getItem).toHaveBeenCalled();
      expect(NetInfo.fetch).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should always check network status when forced', async () => {
      // Mock cached status from AsyncStorage
      const cachedStatus = {
        isConnected: true,
        hasInternet: true,
        lastChecked: Date.now() // Very recent
      };
      
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedStatus));
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ 
        isConnected: true, 
        isInternetReachable: true 
      });
      
      const result = await isOnline(true);
      expect(result).toBe(true);
      // Even with fresh cache, NetInfo.fetch should be called when forced
      expect(NetInfo.fetch).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (NetInfo.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      // Should default to online in case of errors to prevent blocking operations
      const result = await isOnline();
      expect(result).toBe(true);
    });
  });

  describe('setupNetworkListeners', () => {
    it('should set up listeners and return unsubscribe function', () => {
      const unsubscribeMock = jest.fn();
      (NetInfo.addEventListener as jest.Mock).mockReturnValue(unsubscribeMock);
      
      const callbackMock = jest.fn();
      const unsubscribe = setupNetworkListeners(callbackMock);
      
      expect(NetInfo.addEventListener).toHaveBeenCalled();
      expect(unsubscribe).toBe(unsubscribeMock);
      
      // Simulate a network change
      const handler = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];
      const networkState = { isConnected: true, isInternetReachable: true };
      handler(networkState);
      
      // Callback should be called with network state
      expect(callbackMock).toHaveBeenCalledWith(networkState);
      
      // Status should be stored in AsyncStorage
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('getCachedNetworkStatus', () => {
    it('should return cached network status when available', async () => {
      const cachedStatus = {
        isConnected: true,
        hasInternet: true,
        lastChecked: Date.now()
      };
      
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedStatus));
      
      const result = await getCachedNetworkStatus();
      expect(result).toEqual(cachedStatus);
    });

    it('should return null when no cached status is available', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      
      const result = await getCachedNetworkStatus();
      expect(result).toBeNull();
    });

    it('should handle errors and return null', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await getCachedNetworkStatus();
      expect(result).toBeNull();
    });
  });
});