// Test script for memory leak detection and fixes
import { memoryMonitor, formatBytes } from '@/utils/memory-monitor';
import { streamManager } from '@/utils/stream-manager';
import { processAudioFile, cleanupAudioFile, getAudioProcessingStats } from '@/services/audio-service';
import { getConnectionStats, handleMemoryPressure } from '@/utils/websocket/state';
import { createReadStream } from 'fs';
import { createWriteStream as createTempFile } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTempFile(): Promise<string> {
  const tempPath = join(tmpdir(), `test-audio-${Date.now()}.tmp`);
  const stream = createTempFile(tempPath);
  
  // Write some dummy data
  return new Promise((resolve, reject) => {
    stream.write('dummy audio data for testing\n'.repeat(1000));
    stream.end((err) => {
      if (err) reject(err);
      else resolve(tempPath);
    });
  });
}

async function testStreamMemoryLeaks(): Promise<void> {
  console.log('\n=== Testing Stream Memory Leaks ===');
  
  const initialMemory = memoryMonitor.getMemoryUsage();
  console.log('Initial memory:', formatBytes(initialMemory.heapUsed));
  
  // Create many streams to test for leaks
  const streamPromises: Promise<void>[] = [];
  
  for (let i = 0; i < 50; i++) {
    const promise = (async () => {
      const inputPath = await createTempFile();
      const outputPath = join(tmpdir(), `output-${i}-${Date.now()}.tmp`);
      
      try {
        await processAudioFile(inputPath, outputPath, `test-conversation-${i}`);
        await cleanupAudioFile(inputPath);
        await cleanupAudioFile(outputPath);
      } catch (error) {
        console.error(`Error processing file ${i}:`, error);
      }
    })();
    
    streamPromises.push(promise);
    
    // Add small delay to avoid overwhelming the system
    if (i % 10 === 0) {
      await sleep(100);
    }
  }
  
  // Wait for all streams to complete
  await Promise.all(streamPromises);
  
  // Force garbage collection if available
  if (global.gc && typeof global.gc === 'function') {
    global.gc();
    await sleep(1000); // Give GC time to run
  }
  
  const finalMemory = memoryMonitor.getMemoryUsage();
  const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
  
  console.log('Final memory:', formatBytes(finalMemory.heapUsed));
  console.log('Memory growth:', formatBytes(memoryGrowth));
  console.log('Stream stats:', getAudioProcessingStats());
  
  // Check if memory growth is within acceptable limits (10MB)
  const maxAcceptableGrowth = 10 * 1024 * 1024; // 10MB
  if (memoryGrowth > maxAcceptableGrowth) {
    console.error(`❌ MEMORY LEAK DETECTED: Growth of ${formatBytes(memoryGrowth)} exceeds limit of ${formatBytes(maxAcceptableGrowth)}`);
  } else {
    console.log(`✅ Stream memory test passed: Growth of ${formatBytes(memoryGrowth)} is within acceptable limits`);
  }
}

async function testWebSocketMemoryLeaks(): Promise<void> {
  console.log('\n=== Testing WebSocket Memory Leaks ===');
  
  const initialStats = getConnectionStats();
  console.log('Initial connections:', initialStats.totalConnections);
  
  // Simulate memory pressure cleanup
  const cleanedConnections = handleMemoryPressure();
  console.log('Cleaned connections due to memory pressure:', cleanedConnections);
  
  const finalStats = getConnectionStats();
  console.log('Final connections:', finalStats.totalConnections);
  console.log('Idle connections:', finalStats.idleConnections);
  
  console.log('✅ WebSocket memory pressure test completed');
}

async function testMemoryMonitoring(): Promise<void> {
  console.log('\n=== Testing Memory Monitoring ===');
  
  const stats = memoryMonitor.getMemoryStats();
  console.log('Memory stats:');
  console.log('- Heap used:', formatBytes(stats.usage.heapUsed));
  console.log('- Heap total:', formatBytes(stats.usage.heapTotal));
  console.log('- RSS:', formatBytes(stats.usage.rss));
  console.log('- External:', formatBytes(stats.usage.external));
  console.log('- Heap percentage:', Math.round(stats.percentages.heapUsed * 100) + '%');
  console.log('- Warning threshold:', Math.round(stats.thresholds.warning * 100) + '%');
  console.log('- Critical threshold:', Math.round(stats.thresholds.critical * 100) + '%');
  
  // Test garbage collection
  const gcResult = memoryMonitor.forceGarbageCollection();
  console.log('Garbage collection triggered:', gcResult);
  
  if (gcResult) {
    await sleep(100);
    const afterGcStats = memoryMonitor.getMemoryStats();
    const freed = stats.usage.heapUsed - afterGcStats.usage.heapUsed;
    console.log('Memory freed by GC:', formatBytes(freed > 0 ? freed : 0));
  }
  
  console.log('✅ Memory monitoring test completed');
}

async function testStreamManagerCleanup(): Promise<void> {
  console.log('\n=== Testing Stream Manager Cleanup ===');
  
  const initialStats = streamManager.getStats();
  console.log('Initial streams:', initialStats.totalStreams);
  
  // Create some test streams
  const streamIds: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const id = `test-stream-${i}`;
    await streamManager.createManagedStream(
      id,
      () => createReadStream('/dev/null'),
      { test: true, index: i }
    );
    streamIds.push(id);
  }
  
  const afterCreateStats = streamManager.getStats();
  console.log('After creating streams:', afterCreateStats.totalStreams);
  
  // Wait a bit and then cleanup
  await sleep(1000);
  
  // Remove half manually
  for (let i = 0; i < 5; i++) {
    await streamManager.removeStream(streamIds[i]);
  }
  
  const afterRemovalStats = streamManager.getStats();
  console.log('After manual removal:', afterRemovalStats.totalStreams);
  
  // Cleanup all remaining
  await streamManager.cleanup();
  
  const finalStats = streamManager.getStats();
  console.log('After full cleanup:', finalStats.totalStreams);
  
  if (finalStats.totalStreams === 0) {
    console.log('✅ Stream manager cleanup test passed');
  } else {
    console.error('❌ Stream manager cleanup test failed: streams remaining');
  }
}

async function runAllTests(): Promise<void> {
  console.log('🧪 Starting Memory Leak Tests');
  console.log('Node.js version:', process.version);
  console.log('Platform:', process.platform);
  console.log('Garbage collection available:', typeof global.gc === 'function');
  
  try {
    await testMemoryMonitoring();
    await testStreamManagerCleanup();
    await testStreamMemoryLeaks();
    await testWebSocketMemoryLeaks();
    
    console.log('\n🎉 All memory leak tests completed!');
    
    // Final memory report
    const finalStats = memoryMonitor.getMemoryStats();
    console.log('\n📊 Final Memory Report:');
    console.log('- Heap used:', formatBytes(finalStats.usage.heapUsed));
    console.log('- Total streams:', streamManager.getStats().totalStreams);
    console.log('- Total connections:', getConnectionStats().totalConnections);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  // Start memory monitoring for tests
  memoryMonitor.startMonitoring();
  
  runAllTests()
    .then(() => {
      memoryMonitor.stopMonitoring();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      memoryMonitor.stopMonitoring();
      process.exit(1);
    });
}

export { runAllTests, testStreamMemoryLeaks, testWebSocketMemoryLeaks, testMemoryMonitoring };