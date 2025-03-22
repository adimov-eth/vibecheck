export const log = (message: string, level: 'info' | 'error' | 'debug' = 'info') => {
    if (__DEV__) {
      console[level](`[Client] ${message}`);
    }
  };