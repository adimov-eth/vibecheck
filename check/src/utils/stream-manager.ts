import { EventEmitter } from 'events';
import type { Stream } from 'stream';
import { log } from '@/utils/logger';

export interface ManagedStream {
  id: string;
  stream: Stream;
  createdAt: number;
  lastActivity: number;
  metadata?: Record<string, unknown>;
  cleanup: () => Promise<void>;
}

class StreamManager extends EventEmitter {
  private streams = new Map<string, ManagedStream>();
  private maxStreams = 100;
  private streamTimeout = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupInterval();
    this.setupMemoryPressureHandling();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStreams();
    }, 30000); // Check every 30 seconds
  }

  private setupMemoryPressureHandling(): void {
    // Listen for memory pressure events if available
    if (process.listenerCount && process.on) {
      process.on('memoryPressure', () => {
        this.handleMemoryPressure();
      });
    }
  }

  async createManagedStream<T extends Stream>(
    id: string,
    factory: () => T | Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<ManagedStream> {
    // Enforce stream limits
    if (this.streams.size >= this.maxStreams) {
      await this.cleanupOldestStream();
    }

    try {
      const stream = await factory();
      const now = Date.now();

      const managedStream: ManagedStream = {
        id,
        stream,
        createdAt: now,
        lastActivity: now,
        metadata,
        cleanup: async () => {
          await this.destroyStream(stream);
        }
      };

      // Set up stream event handlers
      this.setupStreamHandlers(managedStream);

      this.streams.set(id, managedStream);
      
      log.debug('Created managed stream', { 
        id, 
        type: stream.constructor.name,
        totalStreams: this.streams.size,
        metadata 
      });

      this.emit('stream:created', managedStream);
      return managedStream;
    } catch (error) {
      log.error('Failed to create managed stream', { id, error });
      throw error;
    }
  }

  private setupStreamHandlers(managedStream: ManagedStream): void {
    const { stream, id } = managedStream;

    // Update last activity on any stream event
    const updateActivity = () => {
      managedStream.lastActivity = Date.now();
    };

    // Set up common stream events
    if (stream.readable) {
      stream.on('data', updateActivity);
      stream.on('readable', updateActivity);
    }

    if (stream.writable) {
      stream.on('drain', updateActivity);
      stream.on('pipe', updateActivity);
    }

    // Handle stream completion
    stream.on('end', () => {
      log.debug('Stream ended', { id });
      this.removeStream(id);
    });

    stream.on('close', () => {
      log.debug('Stream closed', { id });
      this.removeStream(id);
    });

    stream.on('error', (error) => {
      log.error('Stream error', { id, error });
      this.removeStream(id);
    });

    // Handle finish event for writable streams
    if (stream.writable) {
      stream.on('finish', () => {
        log.debug('Stream finished', { id });
        this.removeStream(id);
      });
    }
  }

  async removeStream(id: string): Promise<boolean> {
    const managedStream = this.streams.get(id);
    if (!managedStream) {
      return false;
    }

    try {
      await this.destroyStream(managedStream.stream);
      this.streams.delete(id);
      
      log.debug('Removed managed stream', { 
        id, 
        totalStreams: this.streams.size 
      });

      this.emit('stream:removed', { id, managedStream });
      return true;
    } catch (error) {
      log.error('Error removing managed stream', { id, error });
      return false;
    }
  }

  private async destroyStream(stream: Stream): Promise<void> {
    return new Promise<void>((resolve) => {
      // Set a timeout to ensure we don't hang
      const timeout = setTimeout(() => {
        log.warn('Stream destruction timed out, forcing cleanup');
        resolve();
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        resolve();
      };

      try {
        // Remove all listeners to prevent memory leaks
        stream.removeAllListeners();

        if (stream.destroyed) {
          cleanup();
          return;
        }

        // Handle different stream types
        if ('destroy' in stream && typeof stream.destroy === 'function') {
          stream.destroy();
          cleanup();
        } else if ('close' in stream && typeof stream.close === 'function') {
          (stream as { close(): void }).close();
          cleanup();
        } else if ('end' in stream && typeof stream.end === 'function') {
          (stream as { end(): void }).end();
          cleanup();
        } else {
          cleanup();
        }
      } catch (error) {
        log.error('Error destroying stream', { error });
        cleanup();
      }
    });
  }

  private async cleanupExpiredStreams(): Promise<void> {
    const now = Date.now();
    const expiredStreams: string[] = [];

    for (const [id, managedStream] of this.streams) {
      const age = now - managedStream.lastActivity;
      if (age > this.streamTimeout) {
        expiredStreams.push(id);
      }
    }

    if (expiredStreams.length > 0) {
      log.info('Cleaning up expired streams', { 
        count: expiredStreams.length,
        timeout: this.streamTimeout 
      });

      for (const id of expiredStreams) {
        await this.removeStream(id);
      }
    }
  }

  private async cleanupOldestStream(): Promise<void> {
    if (this.streams.size === 0) {
      return;
    }

    // Find the oldest stream by creation time
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, managedStream] of this.streams) {
      if (managedStream.createdAt < oldestTime) {
        oldestTime = managedStream.createdAt;
        oldestId = id;
      }
    }

    if (oldestId) {
      log.info('Cleaning up oldest stream due to limit', { 
        id: oldestId, 
        age: Date.now() - oldestTime,
        limit: this.maxStreams 
      });
      await this.removeStream(oldestId);
    }
  }

  private async handleMemoryPressure(): Promise<void> {
    log.warn('Memory pressure detected, cleaning up streams');
    
    // Clean up all idle streams (no activity in last minute)
    const now = Date.now();
    const idleStreams: string[] = [];

    for (const [id, managedStream] of this.streams) {
      const idleTime = now - managedStream.lastActivity;
      if (idleTime > 60000) { // 1 minute
        idleStreams.push(id);
      }
    }

    for (const id of idleStreams) {
      await this.removeStream(id);
    }

    log.info('Cleaned up idle streams due to memory pressure', { 
      count: idleStreams.length 
    });
  }

  async cleanup(): Promise<void> {
    log.info('Cleaning up all managed streams');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const streamIds = Array.from(this.streams.keys());
    for (const id of streamIds) {
      await this.removeStream(id);
    }

    this.removeAllListeners();
  }

  getStats(): {
    totalStreams: number;
    streamsByType: Record<string, number>;
    oldestStreamAge: number;
    averageAge: number;
  } {
    const now = Date.now();
    const streamsByType: Record<string, number> = {};
    let totalAge = 0;
    let oldestAge = 0;

    for (const managedStream of this.streams.values()) {
      const type = managedStream.stream.constructor.name;
      streamsByType[type] = (streamsByType[type] || 0) + 1;
      
      const age = now - managedStream.createdAt;
      totalAge += age;
      oldestAge = Math.max(oldestAge, age);
    }

    return {
      totalStreams: this.streams.size,
      streamsByType,
      oldestStreamAge: oldestAge,
      averageAge: this.streams.size > 0 ? totalAge / this.streams.size : 0
    };
  }

  getStreamInfo(id: string): ManagedStream | null {
    return this.streams.get(id) || null;
  }

  updateStreamTimeout(timeoutMs: number): void {
    this.streamTimeout = timeoutMs;
    log.info('Updated stream timeout', { timeoutMs });
  }

  updateMaxStreams(maxStreams: number): void {
    this.maxStreams = maxStreams;
    log.info('Updated max streams limit', { maxStreams });
  }
}

// Create singleton instance
export const streamManager = new StreamManager();

// Export types
export type { ManagedStream };