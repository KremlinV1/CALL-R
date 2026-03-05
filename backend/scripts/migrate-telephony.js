const { Client } = require('pg');
require('dotenv').config();

const sql = `
ALTER TABLE public.telephony_config ALTER COLUMN provider SET DATA TYPE text USING provider::text;
UPDATE public.telephony_config SET provider = 'livekit_sip';
ALTER TABLE public.telephony_config DROP COLUMN IF EXISTS vogent_base_agent_id;
ALTER TABLE public.telephony_config DROP COLUMN IF EXISTS vogent_phone_number_id;
ALTER TABLE public.telephony_config DROP COLUMN IF EXISTS vogent_default_model_id;
ALTER TABLE public.telephony_config DROP COLUMN IF EXISTS dasha_agent_id;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'telephony_provider') THEN DROP TYPE public.telephony_provider; END IF; END $$;
CREATE TYPE public.telephony_provider AS ENUM('livekit_sip');
ALTER TABLE public.telephony_config ALTER COLUMN provider SET DATA TYPE public.telephony_provider USING provider::public.telephony_provider;
`;

(async () => {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('DATABASE_URL not set');
  }
  const client = new Client({ connectionString: conn });
  await client.connect();
  console.log('Connected to database, running migration...');
  await client.query(sql);
  await client.end();
  console.log('✅ Telephony config normalized to livekit_sip and columns dropped.');
})().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
