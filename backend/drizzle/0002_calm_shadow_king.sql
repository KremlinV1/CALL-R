CREATE TYPE "public"."rotation_strategy" AS ENUM('round_robin', 'random', 'least_used', 'weighted');--> statement-breakpoint
CREATE TABLE "phone_number_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"rotation_strategy" "rotation_strategy" DEFAULT 'round_robin' NOT NULL,
	"rotation_interval_minutes" integer DEFAULT 60,
	"max_calls_per_number" integer DEFAULT 100,
	"cooldown_minutes" integer DEFAULT 30,
	"is_active" boolean DEFAULT true,
	"total_calls" integer DEFAULT 0,
	"active_numbers" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"phone_number_id" uuid NOT NULL,
	"calls_made" integer DEFAULT 0,
	"last_used_at" timestamp,
	"is_healthy" boolean DEFAULT true,
	"spam_score" integer DEFAULT 0,
	"cooldown_until" timestamp,
	"weight" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "phone_number_pool_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "single_phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "phone_number_pools" ADD CONSTRAINT "phone_number_pools_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_phone_numbers" ADD CONSTRAINT "pool_phone_numbers_pool_id_phone_number_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."phone_number_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_phone_numbers" ADD CONSTRAINT "pool_phone_numbers_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_phone_number_pool_id_phone_number_pools_id_fk" FOREIGN KEY ("phone_number_pool_id") REFERENCES "public"."phone_number_pools"("id") ON DELETE no action ON UPDATE no action;