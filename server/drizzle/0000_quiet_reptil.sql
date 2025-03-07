CREATE TABLE `audios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`audio_file` text,
	`transcription` text,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`recording_type` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`gpt_response` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
