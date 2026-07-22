ALTER TABLE `custom_dishes` ADD `slogan` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `menu_categories` ADD `emoji` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `status_updated_at` text DEFAULT '' NOT NULL;