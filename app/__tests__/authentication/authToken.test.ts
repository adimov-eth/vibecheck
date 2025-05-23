/**
 * Authentication token hook tests
 */
import { renderHook, act } from '@testing-library/react-hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthToken } from '../../hooks/useAuthToken';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');

// Mock Alert
const mockAlert = jest.fn();
jest.mock('react-native', () => ({
  Alert: {
    alert: mockAlert
  },
  Platform: {
    OS: 'ios'
  }
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn()
  })
}));

// Mock useAuth from @clerk/clerk-expo with more control
const mockGetToken = jest.fn().mockImplementation(async () => 'mock-token');
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    isSignedIn: jest.fn().mockImplementation(async () => true)
  }),
}));

// Used to change mock implementation during tests
beforeEach(() => {
  mockGetToken.mockClear();
  mockGetToken.mockImplementation(async () => 'mock-token');
});

// Create a mock valid JWT token with expiry time
const createMockToken = (expiry: number = Date.now() + 3600000) => {
  // Create mock header and payload
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(expiry / 1000),
    iat: Math.floor(Date.now() / 1000),
    sub: 'user-123'
  }));
  
  // Return mock token (signature doesn't matter for our tests)
  return `${header}.${payload}.mock-signature`;
};

describe('useAuthToken hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  it('should get a fresh token and store it', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    
    const { result } = renderHook(() => useAuthToken());
    
    await act(async () => {
      const token = await result.current.getFreshToken();
      expect(token).toBe('mock-token');
    });
    
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-token');
  });
  
  it('should use cached token if valid and not expiring soon', async () => {
    const mockToken = createMockToken(Date.now() + 3600000); // 1 hour from now
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(mockToken);
    
    const { result } = renderHook(() => useAuthToken());
    
    // Set token status to valid and set expiry time
    await act(async () => {
      // First call to set up the token state
      await result.current.validateToken();
    });
    
    // Clear any previous calls to mockGetToken
    mockGetToken.mockClear();
    
    await act(async () => {
      const token = await result.current.getFreshToken(false);
      // Should get the cached token
      expect(token).toBe(mockToken);
      // getToken should not be called when using cache
      expect(mockGetToken).not.toHaveBeenCalled();
    });
  });
  
  it('should force refresh token when forced parameter is true', async () => {
    const mockToken = createMockToken(Date.now() + 3600000); // 1 hour from now
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(mockToken);
    
    const { result } = renderHook(() => useAuthToken());
    
    // Set token status to valid and set expiry time
    await act(async () => {
      await result.current.validateToken();
    });
    
    // Change mockGetToken to return a fresh token
    mockGetToken.mockImplementationOnce(async () => 'fresh-token');
    
    await act(async () => {
      const token = await result.current.getFreshToken(true);
      // Should get a fresh token
      expect(token).toBe('fresh-token');
      // getToken should be called when forcing refresh
      expect(mockGetToken).toHaveBeenCalled();
    });
  });
  
  it('should refresh token if it is expired or expiring soon', async () => {
    const mockExpiringToken = createMockToken(Date.now() + 120000); // 2 minutes from now
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(mockExpiringToken);
    
    const { result } = renderHook(() => useAuthToken());
    
    // Set token status and expiry time
    await act(async () => {
      await result.current.validateToken();
    });
    
    // Change mockGetToken to return a new token
    mockGetToken.mockImplementationOnce(async () => 'new-token');
    
    await act(async () => {
      const token = await result.current.getFreshToken();
      // Should get a new token
      expect(token).toBe('new-token');
      // getToken should be called for expiring tokens
      expect(mockGetToken).toHaveBeenCalled();
    });
  });
  
  it('should handle authentication errors correctly', async () => {
    // Mock getToken to throw an auth error
    mockGetToken.mockRejectedValueOnce(new Error('Authentication required'));
    
    const { result } = renderHook(() => useAuthToken());
    
    let caughtError: any;
    
    await act(async () => {
      try {
        await result.current.getFreshToken();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        caughtError = error;
      }
    });
    
    // Check error properties instead of instance type
    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Authentication required');
    
    // Should clear token 
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
  });
  
  it('should validate token correctly', async () => {
    const mockValidToken = createMockToken(Date.now() + 3600000); // 1 hour from now
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(mockValidToken);
    
    const { result } = renderHook(() => useAuthToken());
    
    await act(async () => {
      const isValid = await result.current.validateToken();
      expect(isValid).toBe(true);
      expect(result.current.tokenStatus).toBe('valid');
    });
    
    // Test with expired token
    const mockExpiredToken = createMockToken(Date.now() - 3600000); // 1 hour ago
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(mockExpiredToken);
    
    await act(async () => {
      const isValid = await result.current.validateToken();
      expect(isValid).toBe(false);
      expect(result.current.tokenStatus).toBe('expired');
    });
    
    // Test with no token
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    
    await act(async () => {
      const isValid = await result.current.validateToken();
      expect(isValid).toBe(false);
      expect(result.current.tokenStatus).toBe('invalid');
    });
  });
  
  it('should clear token correctly', async () => {
    const { result } = renderHook(() => useAuthToken());
    
    await act(async () => {
      await result.current.clearToken();
    });
    
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
    expect(result.current.tokenStatus).toBe('invalid');
  });
});