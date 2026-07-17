CREATE TABLE `dinner_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`title` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`meal_date` text NOT NULL,
	`theme` text DEFAULT 'warm' NOT NULL,
	`dish_ids` text DEFAULT '[]' NOT NULL,
	`recommended_dish_ids` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dinner_invites_token_unique` ON `dinner_invites` (`token`);--> statement-breakpoint
CREATE TABLE `dinner_journals` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_id` text NOT NULL,
	`title` text DEFAULT '今晚的餐桌日记' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`image_urls` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `difficulty` text DEFAULT '适中' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `recipe_summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `substitutions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `invite_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `guest_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `progress_note` text DEFAULT '' NOT NULL;