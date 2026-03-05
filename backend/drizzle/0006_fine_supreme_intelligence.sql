-- Normalize provider values and shrink enum to livekit_sip
ALTER TABLE "public"."telephony_config" ALTER COLUMN "provider" SET DATA TYPE text USING "provider"::text;--> statement-breakpoint
UPDATE "public"."telephony_config" SET "provider" = 'livekit_sip';--> statement-breakpoint

ALTER TABLE "telephony_config" DROP COLUMN "vogent_base_agent_id";--> statement-breakpoint
ALTER TABLE "telephony_config" DROP COLUMN "vogent_phone_number_id";--> statement-breakpoint
ALTER TABLE "telephony_config" DROP COLUMN "vogent_default_model_id";--> statement-breakpoint
ALTER TABLE "telephony_config" DROP COLUMN "dasha_agent_id";--> statement-breakpoint
DROP TYPE "public"."telephony_provider";--> statement-breakpoint
CREATE TYPE "public"."telephony_provider" AS ENUM('livekit_sip');--> statement-breakpoint
ALTER TABLE "public"."telephony_config" ALTER COLUMN "provider" SET DATA TYPE "public"."telephony_provider" USING "provider"::"public"."telephony_provider";