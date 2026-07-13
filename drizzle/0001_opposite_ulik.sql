CREATE TABLE `custom_dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`flavor` text DEFAULT '家常风味' NOT NULL,
	`minutes` integer DEFAULT 30 NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`ingredients` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
