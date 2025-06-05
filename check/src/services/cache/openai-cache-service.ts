import { cacheService } from './cache-service';
import crypto from 'crypto';
import { log } from '@/utils/logger';

export interface TranscriptionCache {
  text: string;
  duration: number;
  language?: string;
}

export interface AnalysisCache {
  result: any;
  model: string;
  version: string;
  timestamp: Date;
}

export class OpenAICacheService {
  private transcriptionTTL = 30 * 24 * 60 * 60; // 30 days
  private analysisTTL = Infinity; // Forever
  private completionTTL = 7 * 24 * 60 * 60; // 7 days
  
  /**
   * Generate hash for audio file to use as cache key
   */
  private generateAudioHash(audioBuffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(audioBuffer)
      .digest('hex');
  }
  
  /**
   * Get cached transcription
   */
  async getTranscription(
    audioHash: string
  ): Promise<TranscriptionCache | null> {
    const cacheKey = `transcription:${audioHash}`;
    return await cacheService.get<TranscriptionCache>(cacheKey);
  }
  
  /**
   * Cache transcription result
   */
  async cacheTranscription(
    audioHash: string, 
    transcription: TranscriptionCache
  ): Promise<void> {
    const cacheKey = `transcription:${audioHash}`;
    
    await cacheService.set(
      cacheKey,
      transcription,
      { 
        ttl: this.transcriptionTTL, 
        compress: true 
      }
    );
    
    log.info('Transcription cached', { 
      audioHash: audioHash.substring(0, 8),
      textLength: transcription.text.length 
    });
  }
  
  /**
   * Get cached analysis result
   */
  async getAnalysis(
    conversationId: string,
    version: string
  ): Promise<AnalysisCache | null> {
    const cacheKey = `analysis:${conversationId}:${version}`;
    return await cacheService.get<AnalysisCache>(cacheKey);
  }
  
  /**
   * Cache analysis result
   */
  async cacheAnalysis(
    conversationId: string,
    version: string,
    analysis: any,
    model: string
  ): Promise<void> {
    const cacheKey = `analysis:${conversationId}:${version}`;
    
    const cacheData: AnalysisCache = {
      result: analysis,
      model,
      version,
      timestamp: new Date()
    };
    
    await cacheService.set(
      cacheKey,
      cacheData,
      { 
        ttl: this.analysisTTL, 
        compress: true,
        tags: [`conversation:${conversationId}`]
      }
    );
    
    log.info('Analysis cached', { conversationId, version, model });
  }
  
  /**
   * Get cached completion for a prompt
   */
  async getCachedCompletion(
    prompt: string,
    model: string,
    temperature?: number
  ): Promise<string | null> {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${temperature || 0.7}:${prompt}`)
      .digest('hex');
      
    const cacheKey = `completion:${hash}`;
    return await cacheService.get<string>(cacheKey);
  }
  
  /**
   * Cache completion result
   */
  async cacheCompletion(
    prompt: string,
    model: string,
    completion: string,
    temperature?: number
  ): Promise<void> {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${temperature || 0.7}:${prompt}`)
      .digest('hex');
      
    const cacheKey = `completion:${hash}`;
    
    await cacheService.set(
      cacheKey,
      completion,
      { 
        ttl: this.completionTTL,
        compress: completion.length > 1024
      }
    );
  }
  
  /**
   * Cache embedding vectors
   */
  async cacheEmbedding(
    text: string,
    model: string,
    embedding: number[]
  ): Promise<void> {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${text}`)
      .digest('hex');
      
    const cacheKey = `embedding:${hash}`;
    
    await cacheService.set(
      cacheKey,
      embedding,
      { 
        ttl: 30 * 24 * 60 * 60, // 30 days
        compress: true
      }
    );
  }
  
  /**
   * Get cached embedding
   */
  async getEmbedding(
    text: string,
    model: string
  ): Promise<number[] | null> {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${text}`)
      .digest('hex');
      
    const cacheKey = `embedding:${hash}`;
    return await cacheService.get<number[]>(cacheKey);
  }
  
  /**
   * Invalidate all caches for a conversation
   */
  async invalidateConversation(conversationId: string): Promise<void> {
    await cacheService.invalidate(`analysis:${conversationId}:*`);
    await cacheService.invalidateByTag(`conversation:${conversationId}`);
  }
  
  /**
   * Get cache stats for monitoring
   */
  async getCacheStats(): Promise<{
    transcriptions: number;
    analyses: number;
    completions: number;
    embeddings: number;
  }> {
    // This would need Redis SCAN command implementation
    // For now, return placeholder
    return {
      transcriptions: 0,
      analyses: 0,
      completions: 0,
      embeddings: 0
    };
  }
}

export const openAICacheService = new OpenAICacheService();