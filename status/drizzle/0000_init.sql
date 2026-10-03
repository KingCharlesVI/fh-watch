CREATE TABLE `component_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`note` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incident_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incident_id` text NOT NULL,
	`state` text NOT NULL,
	`body` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incident_updates_incident` ON `incident_updates` (`incident_id`,`at`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'incident' NOT NULL,
	`title` text NOT NULL,
	`level` text NOT NULL,
	`state` text DEFAULT 'investigating' NOT NULL,
	`components` text NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`ends_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `incidents_started` ON `incidents` (`started_at`);