import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { aiProviderKeys, telephonyConfig, organizations, phoneNumbers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { encryptApiKey, decryptApiKey } from '../utils/crypto.js';

const router = Router();

// Get masked key prefix for display
function getMaskedKeyPrefix(apiKey: string): string {
  if (apiKey.length <= 8) return '••••••••';
  return apiKey.substring(0, 7) + '...' + apiKey.slice(-4);
}

// Supported providers
const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'deepgram', 'cartesia', 'elevenlabs', 'livekit', 'groq', 'google'] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

// GET /api/settings/ai-providers - Get all AI provider key statuses
router.get('/ai-providers', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all configured keys for this organization
    const configuredKeys = await db
      .select({
        provider: aiProviderKeys.provider,
        keyPrefix: aiProviderKeys.keyPrefix,
        isConfigured: aiProviderKeys.isConfigured,
        lastVerifiedAt: aiProviderKeys.lastVerifiedAt,
        updatedAt: aiProviderKeys.updatedAt,
      })
      .from(aiProviderKeys)
      .where(eq(aiProviderKeys.organizationId, organizationId));

    // Build response with all providers
    const providers = SUPPORTED_PROVIDERS.map(provider => {
      const configured = configuredKeys.find(k => k.provider === provider);
      return {
        provider,
        configured: !!configured?.isConfigured,
        keyPrefix: configured?.keyPrefix || null,
        lastVerifiedAt: configured?.lastVerifiedAt || null,
        updatedAt: configured?.updatedAt || null,
      };
    });

    res.json({ providers });
  } catch (error) {
    console.error('Error fetching AI providers:', error);
    res.status(500).json({ error: 'Failed to fetch AI provider configurations' });
  }
});

// POST /api/settings/ai-providers/:provider - Configure/Update an AI provider key
router.post('/ai-providers/:provider', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { provider } = req.params;
    const { apiKey } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const trimmedKey = apiKey.trim();
    const encryptedKey = encryptApiKey(trimmedKey);
    const keyPrefix = getMaskedKeyPrefix(trimmedKey);

    // Check if key already exists for this org/provider
    const existingKey = await db
      .select()
      .from(aiProviderKeys)
      .where(
        and(
          eq(aiProviderKeys.organizationId, organizationId),
          eq(aiProviderKeys.provider, provider as Provider)
        )
      )
      .limit(1);

    if (existingKey.length > 0) {
      // Update existing key
      await db
        .update(aiProviderKeys)
        .set({
          encryptedKey,
          keyPrefix,
          isConfigured: true,
          updatedAt: new Date(),
        })
        .where(eq(aiProviderKeys.id, existingKey[0].id));
    } else {
      // Insert new key
      await db.insert(aiProviderKeys).values({
        organizationId,
        provider: provider as Provider,
        encryptedKey,
        keyPrefix,
        isConfigured: true,
      });
    }

    // Update the agent .env file (for local development) or environment
    await updateAgentEnvFile(provider as Provider, trimmedKey);

    res.json({ 
      success: true, 
      message: `${provider} API key configured successfully`,
      keyPrefix 
    });
  } catch (error) {
    console.error('Error configuring AI provider:', error);
    res.status(500).json({ error: 'Failed to configure AI provider' });
  }
});

// DELETE /api/settings/ai-providers/:provider - Remove an AI provider key
router.delete('/ai-providers/:provider', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { provider } = req.params;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    await db
      .delete(aiProviderKeys)
      .where(
        and(
          eq(aiProviderKeys.organizationId, organizationId),
          eq(aiProviderKeys.provider, provider as Provider)
        )
      );

    res.json({ success: true, message: `${provider} API key removed` });
  } catch (error) {
    console.error('Error removing AI provider:', error);
    res.status(500).json({ error: 'Failed to remove AI provider' });
  }
});

// GET /api/settings/ai-providers/:provider/key - Get decrypted key (for agent use only, internal)
router.get('/ai-providers/:provider/key', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { provider } = req.params;
    const internalToken = req.headers['x-internal-token'];

    // This endpoint should only be called internally by the agent
    if (internalToken !== process.env.INTERNAL_API_TOKEN) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const key = await db
      .select({ encryptedKey: aiProviderKeys.encryptedKey })
      .from(aiProviderKeys)
      .where(
        and(
          eq(aiProviderKeys.organizationId, organizationId),
          eq(aiProviderKeys.provider, provider as Provider),
          eq(aiProviderKeys.isConfigured, true)
        )
      )
      .limit(1);

    if (key.length === 0) {
      return res.status(404).json({ error: 'API key not configured' });
    }

    const decryptedKey = decryptApiKey(key[0].encryptedKey);
    res.json({ apiKey: decryptedKey });
  } catch (error) {
    console.error('Error fetching API key:', error);
    res.status(500).json({ error: 'Failed to fetch API key' });
  }
});

// POST /api/settings/ai-providers/:provider/verify - Verify an API key works
router.post('/ai-providers/:provider/verify', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;

    if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Verify the key based on provider
    const isValid = await verifyApiKey(provider as Provider, apiKey);

    if (isValid) {
      res.json({ valid: true, message: 'API key is valid' });
    } else {
      res.status(400).json({ valid: false, message: 'API key verification failed' });
    }
  } catch (error) {
    console.error('Error verifying API key:', error);
    res.status(500).json({ error: 'Failed to verify API key' });
  }
});

// Helper function to verify API keys
async function verifyApiKey(provider: Provider, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case 'openai':
        // Verify OpenAI key
        const openaiRes = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return openaiRes.ok;

      case 'anthropic':
        // Verify Anthropic key
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        });
        return anthropicRes.ok || anthropicRes.status === 400; // 400 means auth worked but bad request

      case 'deepgram':
        // Verify Deepgram key
        const deepgramRes = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { 'Authorization': `Token ${apiKey}` }
        });
        return deepgramRes.ok;

      case 'cartesia':
        // Verify Cartesia key (requires version header)
        const cartesiaRes = await fetch('https://api.cartesia.ai/voices', {
          headers: { 
            'X-API-Key': apiKey,
            'Cartesia-Version': '2024-06-10'
          }
        });
        return cartesiaRes.ok;

      case 'elevenlabs':
        // Verify ElevenLabs key
        const elevenRes = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': apiKey }
        });
        return elevenRes.ok;

      case 'livekit':
        // LiveKit uses API key + secret, harder to verify without making a room
        return apiKey.length > 0;

      case 'groq':
        // Verify Groq key (OpenAI-compatible API)
        const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return groqRes.ok;

      case 'google':
        // Verify Google Gemini key
        const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        return googleRes.ok;

      default:
        return false;
    }
  } catch (error) {
    console.error(`Error verifying ${provider} key:`, error);
    return false;
  }
}

// Helper function to update agent .env file
async function updateAgentEnvFile(provider: Provider, apiKey: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  const envPath = path.join(process.cwd(), '..', 'agents', '.env');
  
  try {
    // Check if file exists
    if (!fs.existsSync(envPath)) {
      console.log('Agent .env file not found, skipping update');
      return;
    }

    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Map provider to env variable name
    const envVarMap: Record<Provider, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      deepgram: 'DEEPGRAM_API_KEY',
      cartesia: 'CARTESIA_API_KEY',
      elevenlabs: 'ELEVENLABS_API_KEY',
      livekit: 'LIVEKIT_API_KEY',
      groq: 'GROQ_API_KEY',
      google: 'GOOGLE_API_KEY',
    };

    const envVar = envVarMap[provider];
    const regex = new RegExp(`^${envVar}=.*$`, 'm');
    
    if (regex.test(envContent)) {
      // Update existing variable
      envContent = envContent.replace(regex, `${envVar}=${apiKey}`);
    } else {
      // Add new variable
      envContent += `\n${envVar}=${apiKey}`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`Updated ${envVar} in agent .env file`);
  } catch (error) {
    console.error('Error updating agent .env file:', error);
  }
}

// ============================================
// TELEPHONY PROVIDER ROUTES
// ============================================

const TELEPHONY_PROVIDERS = ['twilio', 'telnyx', 'vonage', 'signalwire', 'livekit_sip', 'vogent'] as const;
type TelephonyProvider = typeof TELEPHONY_PROVIDERS[number];

interface TelephonyConfigRequest {
  provider: TelephonyProvider;
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  sipUri?: string;
  spaceUrl?: string; // SignalWire space name (e.g., "myspace" for myspace.signalwire.com)
  // Vogent specific
  vogentBaseAgentId?: string;
  vogentPhoneNumberId?: string;
  vogentDefaultModelId?: string;
}

// GET /api/settings/telephony - Get telephony configuration
router.get('/telephony', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const config = await db
      .select({
        provider: telephonyConfig.provider,
        accountSidPrefix: telephonyConfig.accountSidPrefix,
        authTokenPrefix: telephonyConfig.authTokenPrefix,
        livekitSipUri: telephonyConfig.livekitSipUri,
        signalwireSpaceUrl: telephonyConfig.signalwireSpaceUrl,
        vogentBaseAgentId: telephonyConfig.vogentBaseAgentId,
        vogentPhoneNumberId: telephonyConfig.vogentPhoneNumberId,
        vogentDefaultModelId: telephonyConfig.vogentDefaultModelId,
        isConfigured: telephonyConfig.isConfigured,
        lastVerifiedAt: telephonyConfig.lastVerifiedAt,
        updatedAt: telephonyConfig.updatedAt,
      })
      .from(telephonyConfig)
      .where(eq(telephonyConfig.organizationId, organizationId))
      .limit(1);

    if (config.length === 0) {
      return res.json({
        configured: false,
        provider: null,
        accountSidPrefix: null,
        authTokenPrefix: null,
      });
    }

    res.json({
      configured: config[0].isConfigured,
      provider: config[0].provider,
      accountSidPrefix: config[0].accountSidPrefix,
      authTokenPrefix: config[0].authTokenPrefix,
      livekitSipUri: config[0].livekitSipUri,
      signalwireSpaceUrl: config[0].signalwireSpaceUrl,
      vogentBaseAgentId: config[0].vogentBaseAgentId,
      vogentPhoneNumberId: config[0].vogentPhoneNumberId,
      vogentDefaultModelId: config[0].vogentDefaultModelId,
      lastVerifiedAt: config[0].lastVerifiedAt,
      updatedAt: config[0].updatedAt,
    });
  } catch (error) {
    console.error('Error fetching telephony config:', error);
    res.status(500).json({ error: 'Failed to fetch telephony configuration' });
  }
});

// POST /api/settings/telephony - Configure telephony provider
router.post('/telephony', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { provider, accountSid, authToken, apiKey, sipUri, spaceUrl, vogentBaseAgentId, vogentPhoneNumberId, vogentDefaultModelId } = req.body as TelephonyConfigRequest;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!provider || !TELEPHONY_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Invalid telephony provider' });
    }

    // Validate required fields based on provider
    if (provider === 'twilio' || provider === 'vonage') {
      if (!accountSid || !authToken) {
        return res.status(400).json({ error: 'Account SID and Auth Token are required' });
      }
    } else if (provider === 'telnyx') {
      if (!apiKey) {
        return res.status(400).json({ error: 'API Key is required for Telnyx' });
      }
    } else if (provider === 'signalwire') {
      if (!accountSid || !authToken || !spaceUrl) {
        return res.status(400).json({ error: 'Project ID, API Token, and Space URL are required for SignalWire' });
      }
    } else if (provider === 'livekit_sip') {
      if (!sipUri) {
        return res.status(400).json({ error: 'SIP URI is required for LiveKit SIP' });
      }
    } else if (provider === 'vogent') {
      if (!apiKey) {
        return res.status(400).json({ error: 'API Key is required for Vogent' });
      }
    }

    // Encrypt credentials
    const encryptedAccountSid = accountSid ? encryptApiKey(accountSid) : null;
    const encryptedAuthToken = authToken ? encryptApiKey(authToken) : null;
    const encryptedApiKeyValue = apiKey ? encryptApiKey(apiKey) : null;

    // Get masked prefixes
    const accountSidPrefix = accountSid ? getMaskedKeyPrefix(accountSid) : null;
    const authTokenPrefix = authToken ? getMaskedKeyPrefix(authToken) : null;

    // Check if config already exists
    const existingConfig = await db
      .select()
      .from(telephonyConfig)
      .where(eq(telephonyConfig.organizationId, organizationId))
      .limit(1);

    if (existingConfig.length > 0) {
      // Update existing config
      await db
        .update(telephonyConfig)
        .set({
          provider,
          encryptedAccountSid,
          encryptedAuthToken,
          encryptedApiKey: encryptedApiKeyValue,
          accountSidPrefix,
          authTokenPrefix,
          livekitSipUri: sipUri || null,
          signalwireSpaceUrl: spaceUrl || null,
          vogentBaseAgentId: vogentBaseAgentId || null,
          vogentPhoneNumberId: vogentPhoneNumberId || null,
          vogentDefaultModelId: vogentDefaultModelId || null,
          isConfigured: true,
          updatedAt: new Date(),
        })
        .where(eq(telephonyConfig.id, existingConfig[0].id));
    } else {
      // Insert new config
      await db.insert(telephonyConfig).values({
        organizationId,
        provider,
        encryptedAccountSid,
        encryptedAuthToken,
        encryptedApiKey: encryptedApiKeyValue,
        accountSidPrefix,
        authTokenPrefix,
        livekitSipUri: sipUri || null,
        signalwireSpaceUrl: spaceUrl || null,
        vogentBaseAgentId: vogentBaseAgentId || null,
        vogentPhoneNumberId: vogentPhoneNumberId || null,
        vogentDefaultModelId: vogentDefaultModelId || null,
        isConfigured: true,
      });
    }

    // Update backend .env file with telephony credentials
    await updateTelephonyEnvFile(provider, { accountSid, authToken, apiKey, spaceUrl });

    res.json({
      success: true,
      message: `${provider} configured successfully`,
      provider,
      accountSidPrefix,
      authTokenPrefix,
    });
  } catch (error) {
    console.error('Error configuring telephony:', error);
    res.status(500).json({ error: 'Failed to configure telephony provider' });
  }
});

// POST /api/settings/telephony/verify - Verify telephony credentials
router.post('/telephony/verify', async (req: Request, res: Response) => {
  try {
    const { provider, accountSid, authToken, apiKey, spaceUrl } = req.body as TelephonyConfigRequest;

    if (!provider || !TELEPHONY_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Invalid telephony provider' });
    }

    const isValid = await verifyTelephonyCredentials(provider, { accountSid, authToken, apiKey, spaceUrl });

    if (isValid) {
      res.json({ valid: true, message: 'Credentials verified successfully' });
    } else {
      res.status(400).json({ valid: false, message: 'Credential verification failed' });
    }
  } catch (error) {
    console.error('Error verifying telephony credentials:', error);
    res.status(500).json({ error: 'Failed to verify credentials' });
  }
});

// DELETE /api/settings/telephony - Remove telephony configuration
router.delete('/telephony', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await db
      .delete(telephonyConfig)
      .where(eq(telephonyConfig.organizationId, organizationId));

    res.json({ success: true, message: 'Telephony configuration removed' });
  } catch (error) {
    console.error('Error removing telephony config:', error);
    res.status(500).json({ error: 'Failed to remove telephony configuration' });
  }
});

// Helper function to verify telephony credentials
async function verifyTelephonyCredentials(
  provider: TelephonyProvider,
  credentials: { accountSid?: string; authToken?: string; apiKey?: string; spaceUrl?: string }
): Promise<boolean> {
  try {
    switch (provider) {
      case 'twilio':
        // Verify Twilio credentials
        const twilioAuth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}.json`, {
          headers: { 'Authorization': `Basic ${twilioAuth}` }
        });
        return twilioRes.ok;

      case 'vonage':
        // Verify Vonage credentials (uses API key + secret)
        const vonageRes = await fetch('https://api.nexmo.com/account/get-balance', {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')}`
          }
        });
        return vonageRes.ok || vonageRes.status === 401; // Some endpoints return 401 but confirm auth works

      case 'telnyx':
        // Verify Telnyx API key
        const telnyxRes = await fetch('https://api.telnyx.com/v2/balance', {
          headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
        });
        return telnyxRes.ok;

      case 'signalwire':
        // Verify SignalWire credentials using Project ID + API Token with Basic Auth
        // API endpoint: https://{space_url}.signalwire.com/api/relay/rest/phone_numbers
        const signalwireAuth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
        const signalwireRes = await fetch(`https://${credentials.spaceUrl}.signalwire.com/api/relay/rest/phone_numbers`, {
          headers: { 'Authorization': `Basic ${signalwireAuth}` }
        });
        return signalwireRes.ok;

      case 'livekit_sip':
        // LiveKit SIP doesn't have a simple verify endpoint
        return true;

      case 'vogent':
        // Verify Vogent API key by listing agents
        const vogentRes = await fetch('https://api.vogent.ai/api/agents', {
          headers: { 'Authorization': `Bearer ${credentials.apiKey}` }
        });
        return vogentRes.ok;

      default:
        return false;
    }
  } catch (error) {
    console.error(`Error verifying ${provider} credentials:`, error);
    return false;
  }
}

// Helper function to update backend .env file with telephony credentials
async function updateTelephonyEnvFile(
  provider: TelephonyProvider,
  credentials: { accountSid?: string; authToken?: string; apiKey?: string; spaceUrl?: string }
): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  const envPath = path.join(process.cwd(), '.env');
  
  try {
    if (!fs.existsSync(envPath)) {
      console.log('Backend .env file not found, skipping update');
      return;
    }

    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Provider-specific env var updates
    const updates: Record<string, string | undefined> = {};
    
    switch (provider) {
      case 'twilio':
        updates['TWILIO_ACCOUNT_SID'] = credentials.accountSid;
        updates['TWILIO_AUTH_TOKEN'] = credentials.authToken;
        break;
      case 'vonage':
        updates['VONAGE_API_KEY'] = credentials.accountSid;
        updates['VONAGE_API_SECRET'] = credentials.authToken;
        break;
      case 'telnyx':
        updates['TELNYX_API_KEY'] = credentials.apiKey;
        break;
      case 'signalwire':
        updates['SIGNALWIRE_PROJECT_ID'] = credentials.accountSid;
        updates['SIGNALWIRE_API_TOKEN'] = credentials.authToken;
        updates['SIGNALWIRE_SPACE_URL'] = credentials.spaceUrl;
        break;
      case 'vogent':
        updates['VOGENT_API_KEY'] = credentials.apiKey;
        break;
    }

    for (const [envVar, value] of Object.entries(updates)) {
      if (value) {
        const regex = new RegExp(`^${envVar}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${envVar}=${value}`);
        } else {
          envContent += `\n${envVar}=${value}`;
        }
      }
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`Updated telephony credentials in backend .env file`);
  } catch (error) {
    console.error('Error updating backend .env file:', error);
  }
}

// ============================================
// GENERIC PHONE NUMBER FETCH & IMPORT
// ============================================

interface ProviderPhoneNumber {
  id: string;
  number: string;
  name: string | null;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  };
  e164: string;
  formatted: string;
}

// Fetch phone numbers from the configured provider
async function fetchProviderPhoneNumbers(
  provider: string,
  config: {
    encryptedAccountSid: string | null;
    encryptedAuthToken: string | null;
    encryptedApiKey: string | null;
    signalwireSpaceUrl: string | null;
  }
): Promise<ProviderPhoneNumber[]> {
  switch (provider) {
    case 'twilio': {
      const accountSid = config.encryptedAccountSid ? decryptApiKey(config.encryptedAccountSid) : '';
      const authToken = config.encryptedAuthToken ? decryptApiKey(config.encryptedAuthToken) : '';
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1000`,
        { headers: { 'Authorization': `Basic ${auth}` } }
      );
      if (!res.ok) throw new Error(`Twilio API error: ${res.statusText}`);
      const data = await res.json() as any;
      return (data.incoming_phone_numbers || []).map((n: any) => ({
        id: n.sid,
        number: n.phone_number,
        name: n.friendly_name || null,
        capabilities: {
          voice: n.capabilities?.voice ?? true,
          sms: n.capabilities?.sms ?? false,
          mms: n.capabilities?.mms ?? false,
          fax: n.capabilities?.fax ?? false,
        },
        e164: n.phone_number,
        formatted: n.friendly_name || n.phone_number,
      }));
    }

    case 'vonage': {
      const apiKey = config.encryptedAccountSid ? decryptApiKey(config.encryptedAccountSid) : '';
      const apiSecret = config.encryptedAuthToken ? decryptApiKey(config.encryptedAuthToken) : '';
      const params = new URLSearchParams({ api_key: apiKey, api_secret: apiSecret });
      const res = await fetch(`https://rest.nexmo.com/account/numbers?${params.toString()}`);
      if (!res.ok) throw new Error(`Vonage API error: ${res.statusText}`);
      const data = await res.json() as any;
      return (data.numbers || []).map((n: any) => ({
        id: n.msisdn,
        number: `+${n.msisdn}`,
        name: null,
        capabilities: {
          voice: n.features?.includes('VOICE') ?? true,
          sms: n.features?.includes('SMS') ?? false,
          mms: n.features?.includes('MMS') ?? false,
          fax: false,
        },
        e164: `+${n.msisdn}`,
        formatted: `+${n.msisdn}`,
      }));
    }

    case 'telnyx': {
      const apiKey = config.encryptedApiKey ? decryptApiKey(config.encryptedApiKey) : '';
      const res = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=250', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Telnyx API error: ${res.statusText}`);
      const data = await res.json() as any;
      return (data.data || []).map((n: any) => ({
        id: n.id,
        number: n.phone_number,
        name: n.connection_name || null,
        capabilities: { voice: true, sms: true, mms: false, fax: false },
        e164: n.phone_number,
        formatted: n.phone_number,
      }));
    }

    case 'signalwire': {
      const projectId = config.encryptedAccountSid ? decryptApiKey(config.encryptedAccountSid) : '';
      const apiToken = config.encryptedAuthToken ? decryptApiKey(config.encryptedAuthToken) : '';
      const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64');
      const res = await fetch(
        `https://${config.signalwireSpaceUrl}.signalwire.com/api/relay/rest/phone_numbers`,
        { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' } }
      );
      if (!res.ok) throw new Error(`SignalWire API error: ${res.statusText}`);
      const data = await res.json() as any;
      return (data.data || []).map((n: any) => ({
        id: n.id,
        number: n.number || n.e164,
        name: n.name || null,
        capabilities: {
          voice: n.capabilities?.voice ?? true,
          sms: n.capabilities?.sms ?? false,
          mms: n.capabilities?.mms ?? false,
          fax: n.capabilities?.fax ?? false,
        },
        e164: n.e164 || n.number,
        formatted: n.formatted || n.number,
      }));
    }

    case 'vogent': {
      const apiKey = config.encryptedApiKey ? decryptApiKey(config.encryptedApiKey) : '';
      const res = await fetch('https://api.vogent.ai/api/phone-numbers', {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Vogent API error: ${res.statusText}`);
      const data = await res.json() as any;
      const numbers = Array.isArray(data) ? data : (data.phoneNumbers || data.data || []);
      return numbers.map((n: any) => ({
        id: n.id,
        number: n.phoneNumber || n.number || n.e164,
        name: n.name || n.label || null,
        capabilities: { voice: true, sms: false, mms: false, fax: false },
        e164: n.phoneNumber || n.number || n.e164,
        formatted: n.phoneNumber || n.number || n.e164,
      }));
    }

    default:
      return [];
  }
}

// GET /api/settings/telephony/phone-numbers - Fetch phone numbers from the configured provider
router.get('/telephony/phone-numbers', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const config = await db
      .select()
      .from(telephonyConfig)
      .where(eq(telephonyConfig.organizationId, organizationId))
      .limit(1);

    if (config.length === 0 || !config[0].isConfigured) {
      return res.status(400).json({
        error: 'No telephony provider configured. Go to Settings > Telephony to set one up.',
      });
    }

    const cfg = config[0];
    const numbers = await fetchProviderPhoneNumbers(cfg.provider, {
      encryptedAccountSid: cfg.encryptedAccountSid,
      encryptedAuthToken: cfg.encryptedAuthToken,
      encryptedApiKey: cfg.encryptedApiKey,
      signalwireSpaceUrl: cfg.signalwireSpaceUrl,
    });

    res.json({
      success: true,
      provider: cfg.provider,
      phoneNumbers: numbers,
      total: numbers.length,
    });
  } catch (error: any) {
    console.error('Error fetching provider phone numbers:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch phone numbers from provider' });
  }
});

// Keep legacy SignalWire endpoint for backwards compatibility
router.get('/signalwire/phone-numbers', async (req: Request, res: Response) => {
  // Redirect to generic endpoint
  return (req as any).app.handle(
    Object.assign(req, { url: '/api/settings/telephony/phone-numbers' }),
    res
  );
});

// POST /api/settings/telephony/import-numbers - Import selected phone numbers into DB
router.post('/telephony/import-numbers', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { numbers, agentId } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'No phone numbers provided for import' });
    }

    // Get telephony config to know which provider
    const config = await db
      .select({ provider: telephonyConfig.provider })
      .from(telephonyConfig)
      .where(eq(telephonyConfig.organizationId, organizationId))
      .limit(1);

    const providerName = config[0]?.provider || 'unknown';

    const imported: string[] = [];
    const failed: { number: string; reason: string }[] = [];

    for (const num of numbers) {
      try {
        const phoneNum = num.e164 || num.number;

        // Check if number already exists
        const existing = await db
          .select()
          .from(phoneNumbers)
          .where(eq(phoneNumbers.number, phoneNum))
          .limit(1);

        if (existing.length > 0) {
          failed.push({ number: phoneNum, reason: 'Already exists' });
          continue;
        }

        await db.insert(phoneNumbers).values({
          organizationId,
          agentId: agentId || null,
          number: phoneNum,
          provider: providerName,
          providerSid: num.id || null,
          label: num.name || null,
          type: 'local',
          capabilities: {
            voice: num.capabilities?.voice ?? true,
            sms: num.capabilities?.sms ?? false,
            mms: num.capabilities?.mms ?? false,
            fax: num.capabilities?.fax ?? false,
          },
          status: 'active',
        });

        imported.push(phoneNum);
      } catch (err: any) {
        console.error(`Failed to import ${num.number}:`, err);
        failed.push({ number: num.number, reason: err.message || 'Import failed' });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      failed: failed.length,
      agentAssigned: agentId || null,
      details: { imported, failed },
    });
  } catch (error) {
    console.error('Error importing phone numbers:', error);
    res.status(500).json({ error: 'Failed to import phone numbers' });
  }
});

// Keep legacy SignalWire import endpoint for backwards compatibility
router.post('/signalwire/import-numbers', async (req: Request, res: Response) => {
  return (req as any).app.handle(
    Object.assign(req, { url: '/api/settings/telephony/import-numbers' }),
    res
  );
});

export default router;
