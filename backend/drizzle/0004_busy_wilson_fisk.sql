ALTER TYPE "public"."telephony_provider" ADD VALUE 'vogent';--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "vogent_base_agent_id" varchar(255);--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "vogent_phone_number_id" varchar(255);--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "vogent_default_model_id" varchar(255);