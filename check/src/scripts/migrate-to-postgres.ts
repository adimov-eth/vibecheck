#!/usr/bin/env bun
import { drizzleDb as sqliteDb, users as sqliteUsers, conversations as sqliteConversations, audios as sqliteAudios, subscriptions as sqliteSubscriptions } from '../database/drizzle';
import { pgDb, users as pgUsers, conversations as pgConversations, audios as pgAudios, subscriptions as pgSubscriptions } from '../database/drizzle.postgres';
import { sql } from 'drizzle-orm';
import { log } from '../utils/logger';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

config();

interface MigrationStats {
  users: { migrated: number; failed: number; skipped: number };
  conversations: { migrated: number; failed: number; skipped: number };
  audios: { migrated: number; failed: number; skipped: number };
  subscriptions: { migrated: number; failed: number; skipped: number };
}

export class SqliteToPostgresMigrator {
  private stats: MigrationStats = {
    users: { migrated: 0, failed: 0, skipped: 0 },
    conversations: { migrated: 0, failed: 0, skipped: 0 },
    audios: { migrated: 0, failed: 0, skipped: 0 },
    subscriptions: { migrated: 0, failed: 0, skipped: 0 },
  };

  private batchSize = 100;
  private dryRun = false;

  constructor(options: { batchSize?: number; dryRun?: boolean } = {}) {
    this.batchSize = options.batchSize || 100;
    this.dryRun = options.dryRun || false;
  }

  async migrate() {
    log.info('Starting SQLite to PostgreSQL migration', { dryRun: this.dryRun });

    try {
      // Run Drizzle migrations for PostgreSQL first
      if (!this.dryRun) {
        log.info('Running PostgreSQL schema migrations...');
        await this.runPostgresMigrations();
      }

      // Migrate data in order of dependencies
      await this.migrateUsers();
      await this.migrateConversations();
      await this.migrateAudios();
      await this.migrateSubscriptions();

      log.info('Migration completed successfully', this.stats);
    } catch (error) {
      log.error('Migration failed', error);
      throw error;
    }
  }

  private async runPostgresMigrations() {
    try {
      // Create enum types first
      await pgDb.execute(sql`
        DO $$ BEGIN
          CREATE TYPE conversation_mode AS ENUM ('therapy', 'coaching', 'interview', 'journal', 'conversation');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await pgDb.execute(sql`
        DO $$ BEGIN
          CREATE TYPE recording_type AS ENUM ('separate', 'live', 'microphone');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await pgDb.execute(sql`
        DO $$ BEGIN
          CREATE TYPE conversation_status AS ENUM ('waiting', 'uploading', 'transcribing', 'analyzing', 'completed', 'failed', 'processing');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await pgDb.execute(sql`
        DO $$ BEGIN
          CREATE TYPE audio_status AS ENUM ('uploaded', 'processing', 'transcribed', 'failed');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      log.info('PostgreSQL enum types created');
    } catch (error) {
      log.error('Failed to create enum types', error);
      throw error;
    }
  }

  private async migrateUsers() {
    log.info('Migrating users...');
    
    const users = await sqliteDb.select().from(sqliteUsers);
    log.info(`Found ${users.length} users to migrate`);

    for (let i = 0; i < users.length; i += this.batchSize) {
      const batch = users.slice(i, i + this.batchSize);
      
      for (const user of batch) {
        try {
          // Check if user already exists
          const existing = await pgDb.select()
            .from(pgUsers)
            .where(sql`${pgUsers.id} = ${user.id}`)
            .limit(1);

          if (existing.length > 0) {
            this.stats.users.skipped++;
            continue;
          }

          if (!this.dryRun) {
            await pgDb.insert(pgUsers).values({
              id: user.id,
              email: user.email,
              name: user.name,
              appAccountToken: user.appAccountToken,
              accountLocked: user.accountLocked === 1,
              accountLockedAt: user.accountLockedAt ? new Date(user.accountLockedAt * 1000) : null,
              accountLockReason: user.accountLockReason,
              unlockToken: user.unlockToken,
              unlockTokenGeneratedAt: user.unlockTokenGeneratedAt ? new Date(user.unlockTokenGeneratedAt * 1000) : null,
              createdAt: new Date(user.createdAt * 1000),
              updatedAt: new Date(user.updatedAt * 1000),
            });
          }
          
          this.stats.users.migrated++;
        } catch (error) {
          log.error(`Failed to migrate user ${user.id}`, error);
          this.stats.users.failed++;
        }
      }

      log.info(`Users progress: ${i + batch.length}/${users.length}`);
    }
  }

  private async migrateConversations() {
    log.info('Migrating conversations...');
    
    const conversations = await sqliteDb.select().from(sqliteConversations);
    log.info(`Found ${conversations.length} conversations to migrate`);

    for (let i = 0; i < conversations.length; i += this.batchSize) {
      const batch = conversations.slice(i, i + this.batchSize);
      
      for (const conv of batch) {
        try {
          // Check if conversation already exists
          const existing = await pgDb.select()
            .from(pgConversations)
            .where(sql`${pgConversations.id} = ${conv.id}`)
            .limit(1);

          if (existing.length > 0) {
            this.stats.conversations.skipped++;
            continue;
          }

          if (!this.dryRun) {
            // Map mode and recordingType to valid enum values
            const mode = this.mapConversationMode(conv.mode);
            const recordingType = this.mapRecordingType(conv.recordingType);
            const status = this.mapConversationStatus(conv.status);

            await pgDb.insert(pgConversations).values({
              id: conv.id,
              userId: conv.userId,
              mode: mode as any,
              recordingType: recordingType as any,
              status: status as any,
              gptResponse: conv.gptResponse,
              errorMessage: conv.errorMessage,
              duration: null,
              transcript: null,
              analysis: null,
              completedAt: null,
              createdAt: new Date(conv.createdAt * 1000),
              updatedAt: new Date(conv.updatedAt * 1000),
            });
          }
          
          this.stats.conversations.migrated++;
        } catch (error) {
          log.error(`Failed to migrate conversation ${conv.id}`, error);
          this.stats.conversations.failed++;
        }
      }

      log.info(`Conversations progress: ${i + batch.length}/${conversations.length}`);
    }
  }

  private async migrateAudios() {
    log.info('Migrating audios...');
    
    const audios = await sqliteDb.select().from(sqliteAudios);
    log.info(`Found ${audios.length} audios to migrate`);

    for (let i = 0; i < audios.length; i += this.batchSize) {
      const batch = audios.slice(i, i + this.batchSize);
      
      for (const audio of batch) {
        try {
          // Skip if audio key already exists
          if (audio.audioKey) {
            const existing = await pgDb.select()
              .from(pgAudios)
              .where(sql`${pgAudios.audioKey} = ${audio.audioKey}`)
              .limit(1);

            if (existing.length > 0) {
              this.stats.audios.skipped++;
              continue;
            }
          }

          if (!this.dryRun) {
            const status = this.mapAudioStatus(audio.status);

            await pgDb.insert(pgAudios).values({
              conversationId: audio.conversationId,
              userId: audio.userId,
              audioFile: audio.audioFile,
              audioKey: audio.audioKey,
              transcription: audio.transcription,
              status: status as any,
              errorMessage: audio.errorMessage,
              duration: null,
              sizeBytes: null,
              createdAt: new Date(audio.createdAt * 1000),
              updatedAt: new Date(audio.updatedAt * 1000),
            });
          }
          
          this.stats.audios.migrated++;
        } catch (error) {
          log.error(`Failed to migrate audio ${audio.id}`, error);
          this.stats.audios.failed++;
        }
      }

      log.info(`Audios progress: ${i + batch.length}/${audios.length}`);
    }
  }

  private async migrateSubscriptions() {
    log.info('Migrating subscriptions...');
    
    const subscriptions = await sqliteDb.select().from(sqliteSubscriptions);
    log.info(`Found ${subscriptions.length} subscriptions to migrate`);

    for (let i = 0; i < subscriptions.length; i += this.batchSize) {
      const batch = subscriptions.slice(i, i + this.batchSize);
      
      for (const sub of batch) {
        try {
          // Check if subscription already exists
          const existing = await pgDb.select()
            .from(pgSubscriptions)
            .where(sql`${pgSubscriptions.id} = ${sub.id}`)
            .limit(1);

          if (existing.length > 0) {
            this.stats.subscriptions.skipped++;
            continue;
          }

          if (!this.dryRun) {
            await pgDb.insert(pgSubscriptions).values({
              id: sub.id,
              userId: sub.userId,
              isActive: sub.isActive === 1,
              expiresDate: sub.expiresDate ? new Date(sub.expiresDate * 1000) : null,
              originalTransactionId: sub.originalTransactionId,
              productId: sub.productId,
              environment: sub.environment,
              lastRenewalDate: sub.lastRenewalDate ? new Date(sub.lastRenewalDate * 1000) : null,
              autoRenewStatus: sub.autoRenewStatus === 1,
              gracePeriodExpiresDate: sub.gracePeriodExpiresDate ? new Date(sub.gracePeriodExpiresDate * 1000) : null,
              cancellationDate: sub.cancellationDate ? new Date(sub.cancellationDate * 1000) : null,
              cancellationReason: sub.cancellationReason,
              billingRetryAttempt: sub.billingRetryAttempt,
              priceConsentStatus: sub.priceConsentStatus,
              notificationType: sub.notificationType,
              notificationUUID: sub.notificationUUID,
              appleReceiptData: null,
              createdAt: new Date(sub.createdAt * 1000),
              updatedAt: new Date(sub.updatedAt * 1000),
            });
          }
          
          this.stats.subscriptions.migrated++;
        } catch (error) {
          log.error(`Failed to migrate subscription ${sub.id}`, error);
          this.stats.subscriptions.failed++;
        }
      }

      log.info(`Subscriptions progress: ${i + batch.length}/${subscriptions.length}`);
    }
  }

  // Helper methods to map values to enum types
  private mapConversationMode(mode: string): string {
    const validModes = ['therapy', 'coaching', 'interview', 'journal', 'conversation'];
    if (validModes.includes(mode)) return mode;
    
    // Map legacy values
    if (mode === 'vent') return 'journal';
    if (mode === 'coach') return 'coaching';
    
    // Default
    return 'conversation';
  }

  private mapRecordingType(type: string): string {
    const validTypes = ['separate', 'live', 'microphone'];
    if (validTypes.includes(type)) return type;
    
    // Default
    return 'microphone';
  }

  private mapConversationStatus(status: string): string {
    const validStatuses = ['waiting', 'uploading', 'transcribing', 'analyzing', 'completed', 'failed', 'processing'];
    if (validStatuses.includes(status)) return status;
    
    // Map legacy values
    if (status === 'pending') return 'waiting';
    
    // Default
    return 'waiting';
  }

  private mapAudioStatus(status: string): string {
    const validStatuses = ['uploaded', 'processing', 'transcribed', 'failed'];
    if (validStatuses.includes(status)) return status;
    
    // Map legacy values
    if (status === 'pending') return 'processing';
    
    // Default
    return 'uploaded';
  }

  async verify() {
    log.info('Verifying migration...');
    
    const sqliteUserCount = await sqliteDb.select({ count: sql<number>`count(*)` }).from(sqliteUsers);
    const pgUserCount = await pgDb.select({ count: sql<number>`count(*)` }).from(pgUsers);
    
    const sqliteConvCount = await sqliteDb.select({ count: sql<number>`count(*)` }).from(sqliteConversations);
    const pgConvCount = await pgDb.select({ count: sql<number>`count(*)` }).from(pgConversations);
    
    const sqliteAudioCount = await sqliteDb.select({ count: sql<number>`count(*)` }).from(sqliteAudios);
    const pgAudioCount = await pgDb.select({ count: sql<number>`count(*)` }).from(pgAudios);
    
    const sqliteSubCount = await sqliteDb.select({ count: sql<number>`count(*)` }).from(sqliteSubscriptions);
    const pgSubCount = await pgDb.select({ count: sql<number>`count(*)` }).from(pgSubscriptions);
    
    log.info('Migration verification:', {
      users: { sqlite: sqliteUserCount[0].count, postgres: pgUserCount[0].count },
      conversations: { sqlite: sqliteConvCount[0].count, postgres: pgConvCount[0].count },
      audios: { sqlite: sqliteAudioCount[0].count, postgres: pgAudioCount[0].count },
      subscriptions: { sqlite: sqliteSubCount[0].count, postgres: pgSubCount[0].count },
    });
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100');

  const migrator = new SqliteToPostgresMigrator({ dryRun, batchSize });

  if (verify) {
    migrator.verify()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Verification failed:', error);
        process.exit(1);
      });
  } else {
    migrator.migrate()
      .then(() => {
        log.info('Migration completed');
        return migrator.verify();
      })
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
}