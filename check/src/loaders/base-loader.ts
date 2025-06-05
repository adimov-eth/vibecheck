import DataLoader from 'dataloader';
import { log } from '@/utils/logger';

export abstract class BaseLoader<K, V> {
  protected loader: DataLoader<K, V>;
  
  constructor(
    batchLoadFn: DataLoader.BatchLoadFn<K, V>,
    options?: DataLoader.Options<K, V>
  ) {
    this.loader = new DataLoader(
      async (keys) => {
        const start = Date.now();
        try {
          const results = await batchLoadFn(keys);
          const duration = Date.now() - start;
          
          if (duration > 100) {
            log.warn('Slow loader batch', {
              loader: this.constructor.name,
              keys: keys.length,
              duration
            });
          }
          
          return results;
        } catch (error) {
          log.error('Loader batch error', {
            loader: this.constructor.name,
            error
          });
          throw error;
        }
      },
      {
        cache: true,
        maxBatchSize: 100,
        batchScheduleFn: (callback) => setTimeout(callback, 10),
        ...options
      }
    );
  }
  
  async load(key: K): Promise<V> {
    return this.loader.load(key);
  }
  
  async loadMany(keys: K[]): Promise<(V | Error)[]> {
    return this.loader.loadMany(keys);
  }
  
  clear(key: K): void {
    this.loader.clear(key);
  }
  
  clearAll(): void {
    this.loader.clearAll();
  }
  
  prime(key: K, value: V): void {
    this.loader.prime(key, value);
  }
}