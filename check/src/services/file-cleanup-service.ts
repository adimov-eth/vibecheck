import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { log } from '@/utils/logger';
import { formatError } from '@/utils/error-formatter';

export interface FileCleanupConfig {
  uploadsDir: string;
  logsDir: string;
  tempFileAge: number; // in milliseconds
  logFileAge: number; // in milliseconds
  maxFiles: number;
}

const defaultConfig: FileCleanupConfig = {
  uploadsDir: './uploads',
  logsDir: './logs',
  tempFileAge: 24 * 60 * 60 * 1000, // 24 hours
  logFileAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxFiles: 1000
};

class FileCleanupService {
  private config: FileCleanupConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<FileCleanupConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async cleanOldFiles(): Promise<{
    uploadsCleaned: number;
    logsCleaned: number;
    totalSpaceFreed: number;
  }> {
    const results = {
      uploadsCleaned: 0,
      logsCleaned: 0,
      totalSpaceFreed: 0
    };

    try {
      // Clean uploads directory
      const uploadsResult = await this.cleanDirectory(
        this.config.uploadsDir,
        this.config.tempFileAge,
        ['*.tmp', '*.temp', '*.upload']
      );
      results.uploadsCleaned = uploadsResult.filesDeleted;
      results.totalSpaceFreed += uploadsResult.spaceFreed;

      // Clean logs directory  
      const logsResult = await this.cleanDirectory(
        this.config.logsDir,
        this.config.logFileAge,
        ['*.log', '*.heapsnapshot']
      );
      results.logsCleaned = logsResult.filesDeleted;
      results.totalSpaceFreed += logsResult.spaceFreed;

      log.info('File cleanup completed', {
        uploadsCleaned: results.uploadsCleaned,
        logsCleaned: results.logsCleaned,
        totalSpaceFreedMB: Math.round(results.totalSpaceFreed / 1024 / 1024 * 100) / 100
      });

    } catch (error) {
      log.error('Error during file cleanup', {
        error: formatError(error)
      });
    }

    return results;
  }

  private async cleanDirectory(
    dirPath: string,
    maxAge: number,
    patterns: string[] = []
  ): Promise<{ filesDeleted: number; spaceFreed: number }> {
    let filesDeleted = 0;
    let spaceFreed = 0;
    const now = Date.now();

    try {
      const files = await readdir(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        
        try {
          const stats = await stat(filePath);
          
          // Skip directories
          if (stats.isDirectory()) {
            continue;
          }
          
          // Check if file matches patterns (if any specified)
          if (patterns.length > 0) {
            const matches = patterns.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(file);
            });
            if (!matches) {
              continue;
            }
          }
          
          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > maxAge) {
            const fileSize = stats.size;
            await unlink(filePath);
            filesDeleted++;
            spaceFreed += fileSize;
            
            log.debug('Deleted old file', {
              file: filePath,
              ageHours: Math.round(fileAge / (1000 * 60 * 60)),
              sizeMB: Math.round(fileSize / 1024 / 1024 * 100) / 100
            });
          }
        } catch (fileError) {
          log.warn('Error processing file during cleanup', {
            file: filePath,
            error: formatError(fileError)
          });
        }
      }
    } catch (dirError) {
      log.warn('Error reading directory during cleanup', {
        directory: dirPath,
        error: formatError(dirError)
      });
    }

    return { filesDeleted, spaceFreed };
  }

  async cleanupOrphanedFiles(): Promise<number> {
    // TODO: Implement logic to find and remove files that are no longer
    // referenced in the database
    const orphanedFiles = 0;
    
    try {
      // This would require querying the database for all audio files
      // and comparing with files in the uploads directory
      log.info('Orphaned file cleanup not yet implemented');
    } catch (error) {
      log.error('Error during orphaned file cleanup', {
        error: formatError(error)
      });
    }

    return orphanedFiles;
  }

  async checkDiskUsage(): Promise<{
    uploadsSize: number;
    logsSize: number;
    totalSize: number;
    fileCount: number;
  }> {
    const stats = {
      uploadsSize: 0,
      logsSize: 0,
      totalSize: 0,
      fileCount: 0
    };

    try {
      // Calculate uploads directory size
      const uploadsStats = await this.getDirectorySize(this.config.uploadsDir);
      stats.uploadsSize = uploadsStats.size;
      stats.fileCount += uploadsStats.count;

      // Calculate logs directory size
      const logsStats = await this.getDirectorySize(this.config.logsDir);
      stats.logsSize = logsStats.size;
      stats.fileCount += logsStats.count;

      stats.totalSize = stats.uploadsSize + stats.logsSize;

    } catch (error) {
      log.error('Error checking disk usage', {
        error: formatError(error)
      });
    }

    return stats;
  }

  private async getDirectorySize(dirPath: string): Promise<{ size: number; count: number }> {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const files = await readdir(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        
        try {
          const stats = await stat(filePath);
          
          if (stats.isFile()) {
            totalSize += stats.size;
            fileCount++;
          } else if (stats.isDirectory()) {
            // Recursively calculate subdirectory size
            const subStats = await this.getDirectorySize(filePath);
            totalSize += subStats.size;
            fileCount += subStats.count;
          }
        } catch (fileError) {
          log.warn('Error getting file stats', {
            file: filePath,
            error: formatError(fileError)
          });
        }
      }
    } catch (dirError) {
      // Directory might not exist or be accessible
      log.debug('Directory not accessible for size calculation', {
        directory: dirPath,
        error: formatError(dirError)
      });
    }

    return { size: totalSize, count: fileCount };
  }

  startAutoCleanup(intervalHours = 6): void {
    if (this.cleanupInterval) {
      log.warn('Auto cleanup already started');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    this.cleanupInterval = setInterval(async () => {
      if (this.isRunning) {
        log.debug('Cleanup already running, skipping interval');
        return;
      }

      this.isRunning = true;
      try {
        await this.cleanOldFiles();
      } catch (error) {
        log.error('Error in scheduled cleanup', {
          error: formatError(error)
        });
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);

    log.info('Auto file cleanup started', {
      intervalHours,
      tempFileAgeHours: this.config.tempFileAge / (1000 * 60 * 60),
      logFileAgeDays: this.config.logFileAge / (1000 * 60 * 60 * 24)
    });
  }

  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.info('Auto file cleanup stopped');
    }
  }

  updateConfig(newConfig: Partial<FileCleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    log.info('File cleanup config updated', this.config);
  }
}

// Export singleton instance
export const fileCleanupService = new FileCleanupService();

// Export the class for custom instances
export { FileCleanupService };