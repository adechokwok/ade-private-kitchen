CREATE TABLE `shopping_checks` (
	`item_key` text PRIMARY KEY NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `custom_dishes` ADD `base_servings` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `dish_snapshot` text DEFAULT '[]' NOT NULL;