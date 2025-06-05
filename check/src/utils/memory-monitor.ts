import { EventEmitter } from 'events';
import { log } from '@/utils/logger';

export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface MemoryThresholds {
  warning: number; // Percentage of heap limit
  critical: number; // Percentage of heap limit
}

class MemoryMonitor extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private checkIntervalMs = 10000; // 10 seconds

  private thresholds: MemoryThresholds = {
    warning: 0.7, // 70% of heap limit
    critical: 0.85, // 85% of heap limit
  };

  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.on('memory:warning', this.handleMemoryWarning.bind(this));
    this.on('memory:critical', this.handleCriticalMemory.bind(this));
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      log.warn('Memory monitoring already started');
      return;
    }

    this.isMonitoring = true;
    log.info('Starting memory monitoring', {
      checkInterval: this.checkIntervalMs,
      thresholds: this.thresholds
    });

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    log.info('Memory monitoring stopped');
  }

  getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    };
  }

  getMemoryStats(): {
    usage: MemoryUsage;
    percentages: {
      heapUsed: number;
      rss: number;
    };
    thresholds: MemoryThresholds;
    isWarning: boolean;
    isCritical: boolean;
  } {
    const usage = this.getMemoryUsage();
    const heapUsedPercent = usage.heapUsed / usage.heapTotal;
    
    // Estimate total system memory (simplified approach)
    const totalSystemMemory = usage.rss + (1024 * 1024 * 1024); // RSS + 1GB buffer
    const rssPercent = usage.rss / totalSystemMemory;

    return {
      usage,
      percentages: {
        heapUsed: heapUsedPercent,
        rss: rssPercent
      },
      thresholds: this.thresholds,
      isWarning: heapUsedPercent > this.thresholds.warning,
      isCritical: heapUsedPercent > this.thresholds.critical
    };
  }

  private checkMemoryUsage(): void {
    try {
      const stats = this.getMemoryStats();
      const { heapUsed } = stats.percentages;

      // Log periodic memory stats
      if (Math.random() < 0.1) { // 10% chance to log stats
        log.debug('Memory usage stats', {
          heapUsedMB: Math.round(stats.usage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(stats.usage.heapTotal / 1024 / 1024),
          rssMB: Math.round(stats.usage.rss / 1024 / 1024),
          heapUsedPercent: Math.round(heapUsed * 100)
        });
      }

      if (heapUsed > this.thresholds.critical) {
        this.emit('memory:critical', stats);
      } else if (heapUsed > this.thresholds.warning) {
        this.emit('memory:warning', stats);
      }
    } catch (error) {
      log.error('Error checking memory usage', { error });
    }
  }

  private handleMemoryWarning(stats: ReturnType<typeof this.getMemoryStats>): void {
    log.warn('Memory usage warning', {
      heapUsedMB: Math.round(stats.usage.heapUsed / 1024 / 1024),
      heapUsedPercent: Math.round(stats.percentages.heapUsed * 100),
      threshold: Math.round(this.thresholds.warning * 100)
    });

    // Trigger gentle garbage collection if available
    if (global.gc && typeof global.gc === 'function') {
      try {
        global.gc();
        log.debug('Triggered garbage collection due to memory warning');
      } catch (error) {
        log.debug('Could not trigger garbage collection', { error });
      }
    }
  }

  private handleCriticalMemory(stats: ReturnType<typeof this.getMemoryStats>): void {
    log.error('Critical memory pressure detected', {
      heapUsedMB: Math.round(stats.usage.heapUsed / 1024 / 1024),
      heapUsedPercent: Math.round(stats.percentages.heapUsed * 100),
      threshold: Math.round(this.thresholds.critical * 100)
    });

    // Emit event for other services to clean up
    this.emit('memory:cleanup_needed');

    // Force garbage collection if available
    if (global.gc && typeof global.gc === 'function') {
      try {
        global.gc();
        log.info('Forced garbage collection due to critical memory pressure');
      } catch (error) {
        log.error('Failed to trigger garbage collection', { error });
      }
    }
  }

  updateThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    log.info('Memory monitoring thresholds updated', this.thresholds);
  }

  forceGarbageCollection(): boolean {
    if (global.gc && typeof global.gc === 'function') {
      try {
        global.gc();
        log.info('Manual garbage collection triggered');
        return true;
      } catch (error) {
        log.error('Failed to trigger manual garbage collection', { error });
        return false;
      }
    } else {
      log.warn('Garbage collection not available (run with --expose-gc flag)');
      return false;
    }
  }

  async createHeapSnapshot(): Promise<string | null> {
    try {
      const heapdump = await import('heapdump');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `heap-${timestamp}.heapsnapshot`;
      const filepath = `./logs/${filename}`;
      
      return new Promise((resolve, reject) => {
        heapdump.writeSnapshot(filepath, (err, filename) => {
          if (err) {
            log.error('Failed to create heap snapshot', { error: err });
            reject(err);
          } else {
            log.info('Heap snapshot created', { filepath: filename });
            resolve(filename);
          }
        });
      });
    } catch (error) {
      log.error('Failed to create heap snapshot', { error });
      return null;
    }
  }
}

// Create singleton instance
export const memoryMonitor = new MemoryMonitor();

// Helper function to format bytes
export function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}