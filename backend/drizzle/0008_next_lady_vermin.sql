ALTER TYPE "public"."telephony_provider" ADD VALUE 'telnyx';--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "telnyx_connection_id" varchar(50);--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "telnyx_sip_username" varchar(100);--> statement-breakpoint
ALTER TABLE "telephony_config" ADD COLUMN "encrypted_telnyx_sip_password" text;