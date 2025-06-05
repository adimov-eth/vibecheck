import { log } from '@/utils/logger';
import crypto from 'crypto';
import { database } from '@/database';

export interface QueryStats {
  queryHash: string;
  executionCount: number;
  avgDuration: number;
  maxDuration: number;
  lastSeen: Date;
}

export class QueryMonitor {
  private slowQueryThreshold = 1000; // 1 second
  private queryStats = new Map<string, {
    count: number;
    totalTime: number;
    maxTime: number;
    lastSeen: Date;
    query: string;
  }>();
  
  private static instance: QueryMonitor;
  
  static getInstance(): QueryMonitor {
    if (!QueryMonitor.instance) {
      QueryMonitor.instance = new QueryMonitor();
    }
    return QueryMonitor.instance;
  }
  
  async trackQuery<T>(
    sql: string,
    params: any[],
    executeFn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    const queryHash = this.hashQuery(sql);
    
    try {
      const result = await executeFn();
      const duration = Date.now() - start;
      
      this.updateStats(queryHash, sql, duration);
      
      if (duration > this.slowQueryThreshold) {
        await this.logSlowQuery(sql, params, duration);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      await this.logQueryError(sql, params, duration, error);
      throw error;
    }
  }
  
  private updateStats(queryHash: string, sql: string, duration: number): void {
    const existing = this.queryStats.get(queryHash) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      lastSeen: new Date(),
      query: sql
    };
    
    this.queryStats.set(queryHash, {
      count: existing.count + 1,
      totalTime: existing.totalTime + duration,
      maxTime: Math.max(existing.maxTime, duration),
      lastSeen: new Date(),
      query: sql
    });
  }
  
  private async logSlowQuery(
    sql: string,
    params: any[],
    duration: number
  ): Promise<void> {
    log.warn('Slow query detected', {
      sql: sql.substring(0, 200), // Truncate for logging
      params: params.length,
      duration,
      threshold: this.slowQueryThreshold
    });
    
    // In production, you might want to store this in a database
    // For now, we'll just log it
  }
  
  private async logQueryError(
    sql: string,
    params: any[],
    duration: number,
    error: any
  ): Promise<void> {
    log.error('Query execution error', {
      sql: sql.substring(0, 200),
      params: params.length,
      duration,
      error: error.message
    });
  }
  
  async getQueryStats(): Promise<QueryStats[]> {
    return Array.from(this.queryStats.entries()).map(([hash, stats]) => ({
      queryHash: hash,
      executionCount: stats.count,
      avgDuration: stats.totalTime / stats.count,
      maxDuration: stats.maxTime,
      lastSeen: stats.lastSeen
    }));
  }
  
  getTopSlowQueries(limit = 10): Array<{
    query: string;
    avgDuration: number;
    executionCount: number;
  }> {
    const sorted = Array.from(this.queryStats.entries())
      .map(([hash, stats]) => ({
        query: stats.query,
        avgDuration: stats.totalTime / stats.count,
        executionCount: stats.count
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration);
    
    return sorted.slice(0, limit);
  }
  
  getMostFrequentQueries(limit = 10): Array<{
    query: string;
    executionCount: number;
    totalTime: number;
  }> {
    const sorted = Array.from(this.queryStats.entries())
      .map(([hash, stats]) => ({
        query: stats.query,
        executionCount: stats.count,
        totalTime: stats.totalTime
      }))
      .sort((a, b) => b.executionCount - a.executionCount);
    
    return sorted.slice(0, limit);
  }
  
  private hashQuery(sql: string): string {
    // Normalize query for hashing (remove whitespace, parameters)
    const normalized = sql
      .replace(/\s+/g, ' ')
      .replace(/\$\d+/g, '?')
      .replace(/\b\d+\b/g, '?') // Replace literal numbers
      .trim()
      .toLowerCase();
      
    return crypto
      .createHash('md5')
      .update(normalized)
      .digest('hex');
  }
  
  reset(): void {
    this.queryStats.clear();
  }
  
  async analyzeQueryPlan(sql: string, params: any[] = []): Promise<any> {
    try {
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
      const result = await database.execute(explainQuery);
      return result;
    } catch (error) {
      log.error('Failed to analyze query plan', { sql, error });
      return null;
    }
  }
}

export const queryMonitor = QueryMonitor.getInstance();