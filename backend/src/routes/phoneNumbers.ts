import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { phoneNumbers, telephonyConfig } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { decryptApiKey } from '../utils/crypto.js';

const router = Router();

// Env var fallbacks
const VONAGE_API_KEY_ENV = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET_ENV = process.env.VONAGE_API_SECRET;

// Helper: get Vonage credentials from DB or env vars
async function getVonageCreds(organizationId: string) {
  const config = await db
    .select({
      provider: telephonyConfig.provider,
      encryptedAccountSid: telephonyConfig.encryptedAccountSid,
      encryptedAuthToken: telephonyConfig.encryptedAuthToken,
    })
    .from(telephonyConfig)
    .where(eq(telephonyConfig.organizationId, organizationId))
    .limit(1);

  if (config.length > 0 && config[0].provider === 'vonage' && config[0].encryptedAccountSid && config[0].encryptedAuthToken) {
    return {
      apiKey: decryptApiKey(config[0].encryptedAccountSid),
      apiSecret: decryptApiKey(config[0].encryptedAuthToken),
    };
  }

  return {
    apiKey: VONAGE_API_KEY_ENV || '',
    apiSecret: VONAGE_API_SECRET_ENV || '',
  };
}

// GET /api/phone-numbers/db - List imported phone numbers from the database
router.get('/db', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const numbers = await db
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.organizationId, organizationId))
      .orderBy(desc(phoneNumbers.createdAt));

    res.json({ numbers, total: numbers.length });
  } catch (error: any) {
    console.error('Error fetching DB phone numbers:', error);
    res.status(500).json({ error: 'Failed to fetch phone numbers' });
  }
});

// DELETE /api/phone-numbers/db/:id - Remove an imported phone number
router.delete('/db/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await db
      .delete(phoneNumbers)
      .where(and(eq(phoneNumbers.id, req.params.id), eq(phoneNumbers.organizationId, organizationId)));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting phone number:', error);
    res.status(500).json({ error: 'Failed to delete phone number' });
  }
});

// Search available Vonage numbers (uses DB creds with env var fallback)
router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { country = 'US', type = 'mobile-lvn', features, pattern, search_pattern } = req.query;

    const creds = await getVonageCreds(organizationId);
    if (!creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({ 
        error: 'Vonage API credentials not configured. Please add them in Settings > Telephony.' 
      });
    }

    const params = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      country: country as string,
    });

    if (type) params.append('type', type as string);
    if (features) params.append('features', features as string);
    if (pattern) params.append('pattern', pattern as string);
    if (search_pattern) params.append('search_pattern', search_pattern as string);

    const response = await fetch(`https://api.nexmo.com/number/search?${params.toString()}`);
    
    if (!response.ok) {
      const error: any = await response.json();
      return res.status(response.status).json({ 
        error: error['error-code-label'] || 'Failed to search numbers',
        details: error 
      });
    }

    const data: any = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Error searching Vonage numbers:', error);
    res.status(500).json({ error: 'Failed to search available numbers' });
  }
});

// Buy a Vonage number
router.post('/buy', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { country, msisdn, target_api_key } = req.body;

    if (!country || !msisdn) {
      return res.status(400).json({ error: 'Country and msisdn are required' });
    }

    const creds = await getVonageCreds(organizationId);
    if (!creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({ 
        error: 'Vonage API credentials not configured. Please add them in Settings > Telephony.' 
      });
    }

    const params = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      country,
      msisdn,
    });

    if (target_api_key) {
      params.append('target_api_key', target_api_key);
    }

    const response = await fetch('https://rest.nexmo.com/number/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: any = await response.json();

    if (!response.ok || data['error-code']) {
      return res.status(response.status || 400).json({ 
        error: data['error-code-label'] || 'Failed to purchase number',
        details: data 
      });
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error buying Vonage number:', error);
    res.status(500).json({ error: 'Failed to purchase number' });
  }
});

// Get owned Vonage numbers
router.get('/owned', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;

    const creds = await getVonageCreds(organizationId);
    if (!creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({ 
        error: 'Vonage API credentials not configured. Please add them in Settings > Telephony.' 
      });
    }

    const params = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
    });

    const response = await fetch(`https://rest.nexmo.com/account/numbers?${params.toString()}`);
    
    if (!response.ok) {
      const error: any = await response.json();
      return res.status(response.status).json({ 
        error: error['error-code-label'] || 'Failed to get owned numbers',
        details: error 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Error getting owned Vonage numbers:', error);
    res.status(500).json({ error: 'Failed to get owned numbers' });
  }
});

// Cancel a Vonage number
router.post('/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const { country, msisdn, target_api_key } = req.body;

    if (!country || !msisdn) {
      return res.status(400).json({ error: 'Country and msisdn are required' });
    }

    const creds = await getVonageCreds(organizationId);
    if (!creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({ 
        error: 'Vonage API credentials not configured. Please add them in Settings > Telephony.' 
      });
    }

    const params = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      country,
      msisdn,
    });

    if (target_api_key) {
      params.append('target_api_key', target_api_key);
    }

    const response = await fetch('https://rest.nexmo.com/number/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: any = await response.json();

    if (!response.ok || data['error-code']) {
      return res.status(response.status || 400).json({ 
        error: data['error-code-label'] || 'Failed to cancel number',
        details: data 
      });
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error canceling Vonage number:', error);
    res.status(500).json({ error: 'Failed to cancel number' });
  }
});

export default router;
