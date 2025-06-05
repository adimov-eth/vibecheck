#!/usr/bin/env bun
import { config } from '@/config';
import { log } from '@/utils/logger';

const API_URL = `http://localhost:${config.port}`;

async function testRateLimiting() {
  console.log('🧪 Testing Rate Limiting Implementation...\n');

  // Test 1: IP-based rate limiting
  console.log('1️⃣ Testing IP-based rate limiting...');
  const testIP = '192.168.1.100';
  
  for (let i = 1; i <= 7; i++) {
    try {
      const response = await fetch(`${API_URL}/api/users/apple-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIP
        },
        body: JSON.stringify({
          identityToken: 'invalid-token',
          email: `test${i}@example.com`
        })
      });

      const headers = {
        limit: response.headers.get('X-RateLimit-Limit'),
        remaining: response.headers.get('X-RateLimit-Remaining'),
        reset: response.headers.get('X-RateLimit-Reset'),
        retryAfter: response.headers.get('Retry-After')
      };

      console.log(`  Attempt ${i}: Status ${response.status}, Remaining: ${headers.remaining}/${headers.limit}`);
      
      if (response.status === 429) {
        console.log(`  ✅ Rate limit enforced after ${i} attempts. Retry after: ${headers.retryAfter}s`);
        break;
      }
    } catch (error) {
      console.error(`  ❌ Error in attempt ${i}:`, error);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n2️⃣ Testing progressive delays...');
  // Reset and test progressive delays
  await new Promise(resolve => setTimeout(resolve, 2000));

  const startTime = Date.now();
  for (let i = 1; i <= 4; i++) {
    const attemptStart = Date.now();
    
    try {
      const response = await fetch(`${API_URL}/api/users/apple-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101'
        },
        body: JSON.stringify({
          identityToken: 'invalid-token',
          email: 'progressive@example.com'
        })
      });

      const attemptDuration = Date.now() - attemptStart;
      console.log(`  Attempt ${i}: Status ${response.status}, Duration: ${attemptDuration}ms`);
    } catch (error) {
      console.error(`  ❌ Error in attempt ${i}:`, error);
    }
  }

  console.log('\n3️⃣ Testing CAPTCHA requirement...');
  // Test CAPTCHA after multiple failures
  const captchaTestIP = '192.168.1.102';
  
  for (let i = 1; i <= 4; i++) {
    try {
      const response = await fetch(`${API_URL}/api/users/apple-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': captchaTestIP
        },
        body: JSON.stringify({
          identityToken: 'invalid-token',
          email: 'captcha@example.com'
        })
      });

      const data = await response.json();
      console.log(`  Attempt ${i}: Status ${response.status}`);
      
      if (data.captchaRequired) {
        console.log('  ✅ CAPTCHA required after 3 attempts');
        
        // Get CAPTCHA challenge
        const captchaResponse = await fetch(`${API_URL}/api/auth/captcha`);
        const captchaData = await captchaResponse.json();
        console.log(`  CAPTCHA Challenge: ${captchaData.data?.question}`);
        break;
      }
    } catch (error) {
      console.error(`  ❌ Error in attempt ${i}:`, error);
    }
  }

  console.log('\n4️⃣ Testing account unlock flow...');
  try {
    // Request unlock
    const unlockResponse = await fetch(`${API_URL}/api/auth/unlock-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'locked@example.com' })
    });
    
    const unlockData = await unlockResponse.json();
    console.log('  Unlock request:', unlockData.message);
  } catch (error) {
    console.error('  ❌ Error requesting unlock:', error);
  }

  console.log('\n5️⃣ Testing rate limit statistics...');
  if (process.env.NODE_ENV === 'development') {
    try {
      const statsResponse = await fetch(`${API_URL}/api/auth/rate-limit-stats`);
      const stats = await statsResponse.json();
      
      if (stats.success) {
        console.log('  Failed attempts by IP:', Object.keys(stats.data.failedLogins.failedAttemptsByIP).length);
        console.log('  Blocked IPs:', stats.data.failedLogins.blockedIPs.length);
        console.log('  CAPTCHA solve rate:', stats.data.captcha.solveRate.toFixed(2) + '%');
      }
    } catch (error) {
      console.error('  ❌ Error getting stats:', error);
    }
  }

  console.log('\n✅ Rate limiting tests completed!');
}

// Run tests
testRateLimiting().catch(console.error);