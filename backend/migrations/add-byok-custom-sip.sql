-- BYOK: let each organization bring its own SIP carrier.
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
-- PostgreSQL < 12, so run this statement on its own if your client wraps
-- migrations in a transaction.
ALTER TYPE "telephony_provider" ADD VALUE IF NOT EXISTS 'custom_sip';

ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "custom_sip_host" varchar(255);
ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "custom_sip_username" varchar(100);
ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "encrypted_custom_sip_password" text;
ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "custom_sip_transport" varchar(10) DEFAULT 'auto';
ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "custom_sip_numbers" jsonb;
ALTER TABLE "telephony_config" ADD COLUMN IF NOT EXISTS "livekit_outbound_trunk_id" varchar(100);
