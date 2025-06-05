CREATE TABLE `audios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversationId` text NOT NULL,
	`userId` text NOT NULL,
	`audioFile` text,
	`audioKey` text,
	`transcription` text,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`errorMessage` text,
	`createdAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	`updatedAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audios_conversationId` ON `audios` (`conversationId`);--> statement-breakpoint
CREATE INDEX `idx_audios_userId` ON `audios` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_audios_status` ON `audios` (`status`);--> statement-breakpoint
CREATE INDEX `idx_audios_conversationId_audioKey` ON `audios` (`conversationId`,`audioKey`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`mode` text NOT NULL,
	`recordingType` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`gptResponse` text,
	`errorMessage` text,
	`createdAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	`updatedAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_userId` ON `conversations` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_conversations_status` ON `conversations` (`status`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`isActive` integer DEFAULT 1 NOT NULL,
	`expiresDate` integer,
	`originalTransactionId` text,
	`productId` text,
	`environment` text,
	`lastRenewalDate` integer,
	`autoRenewStatus` integer,
	`gracePeriodExpiresDate` integer,
	`cancellationDate` integer,
	`cancellationReason` text,
	`billingRetryAttempt` integer,
	`priceConsentStatus` integer,
	`notificationType` text,
	`notificationUUID` text,
	`createdAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	`updatedAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_userId` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`appAccountToken` text,
	`createdAt` integer DEFAULT strftime('%s', 'now') NOT NULL,
	`updatedAt` integer DEFAULT strftime('%s', 'now') NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_appAccountToken_unique` ON `users` (`appAccountToken`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_appAccountToken` ON `users` (`appAccountToken`);