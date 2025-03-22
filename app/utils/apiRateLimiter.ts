/**
 * API Rate Limiter Utility
 * Provides rate limiting for API requests to prevent flooding the server
 */

// Store the last request times for different endpoints
const lastRequestTimes: Record<string, number> = {};

// Default configurations for rate limiting
const DEFAULT_MIN_INTERVAL = 5000; // 5 seconds minimum between requests to the same endpoint
const DEFAULT_CONCURRENT_LIMIT = 3; // Maximum concurrent requests

// Track ongoing requests to limit concurrency
const ongoingRequests: Record<string, number> = {};

// Queue for delayed requests
interface QueuedRequest {
  key: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  timeoutId?: NodeJS.Timeout;
}

const requestQueue: QueuedRequest[] = [];

/**
 * Process the request queue to handle delayed requests
 */
function processQueue(): void {
  // Sort queue by timestamp (oldest first)
  requestQueue.sort((a, b) => a.timestamp - b.timestamp);
  
  // Process queue from the oldest request
  for (let i = 0; i < requestQueue.length; i++) {
    const request = requestQueue[i];
    const now = Date.now();
    
    // Skip if the endpoint is still rate-limited
    const lastTime = lastRequestTimes[request.key] || 0;
    if (now - lastTime < DEFAULT_MIN_INTERVAL) {
      continue;
    }
    
    // Skip if we've hit the concurrent request limit
    const concurrentCount = ongoingRequests[request.key] || 0;
    if (concurrentCount >= DEFAULT_CONCURRENT_LIMIT) {
      continue;
    }
    
    // Execute the request
    executeRequest(request);
    
    // Remove from queue
    requestQueue.splice(i, 1);
    i--; // Adjust index after removal
  }
}

/**
 * Execute a queued request
 */
function executeRequest(request: QueuedRequest): void {
  // Clear any pending timeout
  if (request.timeoutId) {
    clearTimeout(request.timeoutId);
  }
  
  // Update tracking data
  lastRequestTimes[request.key] = Date.now();
  ongoingRequests[request.key] = (ongoingRequests[request.key] || 0) + 1;
  
  // Execute the request
  request.execute()
    .then(result => {
      request.resolve(result);
    })
    .catch(error => {
      request.reject(error);
    })
    .finally(() => {
      // Decrement ongoing requests count
      ongoingRequests[request.key] = Math.max(0, (ongoingRequests[request.key] || 1) - 1);
      
      // Process queue again
      processQueue();
    });
}

/**
 * Options for rate limiting API requests
 */
interface RateLimitOptions {
  // Key to identify the endpoint for rate limiting (defaults to the URL)
  key?: string;
  // Minimum time between requests in milliseconds
  minInterval?: number;
  // How long to wait before timing out a queued request
  queueTimeout?: number;
  // Priority in the queue (lower means higher priority)
  priority?: number;
}

/**
 * Rate limit a fetch API request
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param rateLimitOptions - Rate limiting configuration
 * @returns Promise resolving to the fetch response
 */
export function rateLimitedFetch(
  url: string,
  options?: RequestInit,
  rateLimitOptions?: RateLimitOptions
): Promise<Response> {
  const key = rateLimitOptions?.key || url;
  const minInterval = rateLimitOptions?.minInterval || DEFAULT_MIN_INTERVAL;
  const queueTimeout = rateLimitOptions?.queueTimeout || 30000; // 30 seconds default
  
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const lastTime = lastRequestTimes[key] || 0;
    const timeSinceLastRequest = now - lastTime;
    
    // Function to execute the fetch request
    const executeFetch = async () => {
      try {
        return await fetch(url, options);
      } catch (error) {
        throw error;
      }
    };
    
    // If we've made a request recently to this endpoint and haven't hit the interval,
    // or if we have too many concurrent requests, queue the request
    if (timeSinceLastRequest < minInterval || (ongoingRequests[key] || 0) >= DEFAULT_CONCURRENT_LIMIT) {
      // Calculate delay time
      const delay = Math.max(0, minInterval - timeSinceLastRequest);
      
      // Create the queued request
      const queuedRequest: QueuedRequest = {
        key,
        execute: executeFetch,
        resolve,
        reject,
        timestamp: now,
      };
      
      // Add timeout to reject the request if it's queued too long
      queuedRequest.timeoutId = setTimeout(() => {
        // Remove from queue
        const index = requestQueue.indexOf(queuedRequest);
        if (index !== -1) {
          requestQueue.splice(index, 1);
        }
        
        // Reject with timeout error
        reject(new Error(`Request to ${url} timed out while waiting in rate limiting queue`));
      }, queueTimeout);
      
      // Add to queue
      requestQueue.push(queuedRequest);
      
      // Process queue later if necessary
      if (delay > 0) {
        setTimeout(processQueue, delay);
      } else {
        processQueue();
      }
    } else {
      // We can execute the request immediately
      lastRequestTimes[key] = now;
      ongoingRequests[key] = (ongoingRequests[key] || 0) + 1;
      
      executeFetch()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          // Decrement ongoing requests count
          ongoingRequests[key] = Math.max(0, (ongoingRequests[key] || 1) - 1);
          
          // Process queue again
          processQueue();
        });
    }
  });
}

/**
 * Create a rate-limited version of any async function
 * Useful for rate limiting non-fetch API calls
 * 
 * @param fn - The function to rate limit
 * @param options - Rate limiting options
 * @returns Rate-limited function
 */
export function createRateLimitedFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RateLimitOptions & { key: string }
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const key = options.key;
    const minInterval = options.minInterval || DEFAULT_MIN_INTERVAL;
    const queueTimeout = options.queueTimeout || 30000; // 30 seconds default
    
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const lastTime = lastRequestTimes[key] || 0;
      const timeSinceLastRequest = now - lastTime;
      
      // Function to execute the original function
      const executeFunction = async () => {
        try {
          return await fn(...args);
        } catch (error) {
          throw error;
        }
      };
      
      // If we've run the function recently and haven't hit the interval,
      // or if we have too many concurrent calls, queue the execution
      if (timeSinceLastRequest < minInterval || (ongoingRequests[key] || 0) >= DEFAULT_CONCURRENT_LIMIT) {
        // Calculate delay time
        const delay = Math.max(0, minInterval - timeSinceLastRequest);
        
        // Create the queued request
        const queuedRequest: QueuedRequest = {
          key,
          execute: executeFunction,
          resolve,
          reject,
          timestamp: now,
        };
        
        // Add timeout to reject the request if it's queued too long
        queuedRequest.timeoutId = setTimeout(() => {
          // Remove from queue
          const index = requestQueue.indexOf(queuedRequest);
          if (index !== -1) {
            requestQueue.splice(index, 1);
          }
          
          // Reject with timeout error
          reject(new Error(`Function call to ${key} timed out while waiting in rate limiting queue`));
        }, queueTimeout);
        
        // Add to queue
        requestQueue.push(queuedRequest);
        
        // Process queue later if necessary
        if (delay > 0) {
          setTimeout(processQueue, delay);
        } else {
          processQueue();
        }
      } else {
        // We can execute immediately
        lastRequestTimes[key] = now;
        ongoingRequests[key] = (ongoingRequests[key] || 0) + 1;
        
        executeFunction()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            // Decrement ongoing requests count
            ongoingRequests[key] = Math.max(0, (ongoingRequests[key] || 1) - 1);
            
            // Process queue again
            processQueue();
          });
      }
    });
  };
} 