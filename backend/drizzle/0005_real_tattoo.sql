ALTER TYPE "public"."telephony_provider" ADD VALUE 'dasha';--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "dasha_agent_id" varchar(255);