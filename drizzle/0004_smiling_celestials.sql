CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_name_unique` ON `menu_categories` (`name`);--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`type` text DEFAULT '其他' NOT NULL,
	`location` text DEFAULT '家中库存' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `image_position` text DEFAULT 'center' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `gallery` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `featured` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `available` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `sold_out` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `seasons` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `occasions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `dietary` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `sort_order` integer DEFAULT 0 NOT NULL;