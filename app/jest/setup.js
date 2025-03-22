// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock React Native's Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

// Mock Clerk authentication
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(() => ({
    getToken: jest.fn(() => Promise.resolve('mock-token')),
    isSignedIn: jest.fn(() => Promise.resolve(true)),
  })),
  useSignIn: jest.fn(() => ({
    signIn: jest.fn(),
    setActive: jest.fn(),
    isLoaded: true,
  })),
}));

// Mock local credentials
jest.mock('@clerk/clerk-expo/local-credentials', () => ({
  useLocalCredentials: jest.fn(() => ({
    hasCredentials: true,
    setCredentials: jest.fn(),
    authenticate: jest.fn(),
  })),
}));

// Mock global btoa and atob (used in token parsing)
global.btoa = jest.fn(str => Buffer.from(str, 'binary').toString('base64'));
global.atob = jest.fn(str => Buffer.from(str, 'base64').toString('binary'));

// Mock setTimeout, clearTimeout, etc.
jest.useFakeTimers();