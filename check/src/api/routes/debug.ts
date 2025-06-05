import { Router } from 'express';
import { memoryMonitor, formatBytes } from '@/utils/memory-monitor';
import { streamManager } from '@/utils/stream-manager';
import { getClientsByUserId } from '@/utils/websocket/state';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

// Only enable debug endpoints in development
const isDevelopment = process.env.NODE_ENV === 'development';

if (!isDevelopment) {
  router.use((req, res) => {
    res.status(404).json({ error: 'Debug endpoints not available in production' });
  });
} else {
  // Memory usage endpoint
  router.get('/memory-usage', asyncHandler(async (req, res) => {
    const stats = memoryMonitor.getMemoryStats();
    const formattedStats = {
      memory: {
        rss: formatBytes(stats.usage.rss),
        heapTotal: formatBytes(stats.usage.heapTotal),
        heapUsed: formatBytes(stats.usage.heapUsed),
        external: formatBytes(stats.usage.external),
        arrayBuffers: formatBytes(stats.usage.arrayBuffers)
      },
      percentages: {
        heapUsed: `${Math.round(stats.percentages.heapUsed * 100)}%`,
        rss: `${Math.round(stats.percentages.rss * 100)}%`
      },
      thresholds: {
        warning: `${Math.round(stats.thresholds.warning * 100)}%`,
        critical: `${Math.round(stats.thresholds.critical * 100)}%`
      },
      status: {
        isWarning: stats.isWarning,
        isCritical: stats.isCritical
      },
      raw: stats.usage
    };

    res.json({
      success: true,
      data: formattedStats
    });
  }));

  // Create heap snapshot
  router.post('/heap-snapshot', asyncHandler(async (req, res) => {
    const filename = await memoryMonitor.createHeapSnapshot();
    
    if (filename) {
      res.json({
        success: true,
        data: {
          filename,
          message: 'Heap snapshot created successfully'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create heap snapshot'
      });
    }
  }));

  // Force garbage collection
  router.post('/gc', asyncHandler(async (req, res) => {
    const beforeStats = memoryMonitor.getMemoryStats();
    const success = memoryMonitor.forceGarbageCollection();
    
    if (success) {
      // Wait a bit for GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      const afterStats = memoryMonitor.getMemoryStats();
      
      const freed = beforeStats.usage.heapUsed - afterStats.usage.heapUsed;
      
      res.json({
        success: true,
        data: {
          message: 'Garbage collection triggered',
          before: {
            heapUsed: formatBytes(beforeStats.usage.heapUsed),
            heapTotal: formatBytes(beforeStats.usage.heapTotal)
          },
          after: {
            heapUsed: formatBytes(afterStats.usage.heapUsed),
            heapTotal: formatBytes(afterStats.usage.heapTotal)
          },
          freed: formatBytes(freed > 0 ? freed : 0)
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Garbage collection not available (run with --expose-gc flag)'
      });
    }
  }));

  // Stream statistics
  router.get('/streams', asyncHandler(async (req, res) => {
    const stats = streamManager.getStats();
    
    res.json({
      success: true,
      data: {
        totalStreams: stats.totalStreams,
        streamsByType: stats.streamsByType,
        oldestStreamAge: `${Math.round(stats.oldestStreamAge / 1000)}s`,
        averageAge: `${Math.round(stats.averageAge / 1000)}s`,
        details: stats
      }
    });
  }));

  // WebSocket connection statistics
  router.get('/websockets', asyncHandler(async (req, res) => {
    const clientsByUserId = getClientsByUserId();
    let totalConnections = 0;
    const userConnections: Array<{ userId: string; connections: number; topics: string[] }> = [];

    for (const [userId, clients] of clientsByUserId) {
      totalConnections += clients.size;
      
      // Aggregate topics from all user's connections
      const allTopics = new Set<string>();
      for (const client of clients) {
        for (const topic of client.subscribedTopics) {
          allTopics.add(topic);
        }
      }
      
      userConnections.push({
        userId,
        connections: clients.size,
        topics: Array.from(allTopics)
      });
    }

    res.json({
      success: true,
      data: {
        totalConnections,
        totalUsers: clientsByUserId.size,
        userConnections
      }
    });
  }));

  // System information
  router.get('/system', asyncHandler(async (req, res) => {
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();
    
    res.json({
      success: true,
      data: {
        uptime: `${Math.round(uptime)}s`,
        uptimeFormatted: formatUptime(uptime),
        cpuUsage,
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
        title: process.title,
        argv: process.argv,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          npm_package_version: process.env.npm_package_version
        }
      }
    });
  }));

  // GC statistics (if available)
  router.get('/gc-stats', asyncHandler(async (req, res) => {
    try {
      // Try to get GC stats if v8 module is available
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const v8 = require('v8');
      const heapStats = v8.getHeapStatistics();
      const heapSpaceStats = v8.getHeapSpaceStatistics();
      
      res.json({
        success: true,
        data: {
          heapStatistics: heapStats,
          heapSpaceStatistics: heapSpaceStats
        }
      });
    } catch (error) {
      res.json({
        success: false,
        error: 'GC statistics not available',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // Cleanup endpoint for testing
  router.post('/cleanup', asyncHandler(async (req, res) => {
    const { streams = false, memory = false } = req.body;
    const actions: string[] = [];

    if (streams) {
      const streamStats = streamManager.getStats();
      await streamManager.cleanup();
      actions.push(`Cleaned up ${streamStats.totalStreams} streams`);
    }

    if (memory) {
      const success = memoryMonitor.forceGarbageCollection();
      if (success) {
        actions.push('Triggered garbage collection');
      }
    }

    res.json({
      success: true,
      data: {
        message: 'Cleanup completed',
        actions
      }
    });
  }));
}

function formatUptime(uptime: number): string {
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default router;