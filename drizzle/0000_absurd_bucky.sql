CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`meal_date` text NOT NULL,
	`guest_count` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`dishes` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
