import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { phoneNumbers, telephonyConfig, agents } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { decryptApiKey } from '../utils/crypto.js';
import { createTelnyxService } from '../services/telnyx.js';

const router = Router();

// Env vars
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || '';

// ─── DB CRUD ────────────────────────────────────────────────────────

// GET /api/phone-numbers/db - List imported phone numbers
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

// POST /api/phone-numbers/db - Manually add a phone number
router.post('/db', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { number, provider, providerSid, label, type, capabilities, agentId } = req.body;

    if (!number) return res.status(400).json({ error: 'number is required' });

    const formatted = number.startsWith('+') ? number : `+1${number.replace(/\D/g, '')}`;

    // Check duplicate
    const existing = await db.select().from(phoneNumbers).where(eq(phoneNumbers.number, formatted)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: 'Phone number already exists' });

    const [created] = await db.insert(phoneNumbers).values({
      organizationId,
      number: formatted,
      provider: provider || 'telnyx',
      providerSid: providerSid || null,
      label: label || null,
      type: type || 'local',
      capabilities: capabilities || { voice: true, sms: false },
      agentId: agentId || null,
      status: 'active',
    }).returning();

    res.status(201).json({ number: created });
  } catch (error: any) {
    console.error('Error adding phone number:', error);
    res.status(500).json({ error: 'Failed to add phone number' });
  }
});

// PUT /api/phone-numbers/db/:id - Update phone number metadata
router.put('/db/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { label, agentId, status, capabilities, type } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (label !== undefined) updateData.label = label;
    if (agentId !== undefined) updateData.agentId = agentId || null;
    if (status !== undefined) updateData.status = status;
    if (capabilities !== undefined) updateData.capabilities = capabilities;
    if (type !== undefined) updateData.type = type;

    const [updated] = await db
      .update(phoneNumbers)
      .set(updateData)
      .where(and(eq(phoneNumbers.id, req.params.id), eq(phoneNumbers.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Phone number not found' });

    res.json({ number: updated });
  } catch (error: any) {
    console.error('Error updating phone number:', error);
    res.status(500).json({ error: 'Failed to update phone number' });
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

// ─── TELNYX PROVIDER ────────────────────────────────────────────────

// GET /api/phone-numbers/telnyx/owned - List numbers from Telnyx account
router.get('/telnyx/owned', async (req: AuthRequest, res: Response) => {
  try {
    if (!TELNYX_API_KEY) return res.status(400).json({ error: 'Telnyx API key not configured' });

    const telnyx = createTelnyxService(TELNYX_API_KEY);
    const data = await telnyx.listPhoneNumbers({ pageSize: 100 });

    const numbers = (data.data || []).map((n: any) => ({
      id: n.id,
      number: n.phone_number,
      status: n.status,
      type: n.phone_number_type,
      connectionId: n.connection_id,
      capabilities: {
        voice: true,
        sms: n.messaging_profile_id ? true : false,
      },
    }));

    res.json({ numbers, total: numbers.length });
  } catch (error: any) {
    console.error('Error listing Telnyx numbers:', error.message);
    res.status(500).json({ error: 'Failed to list Telnyx numbers' });
  }
});

// GET /api/phone-numbers/telnyx/search - Search available Telnyx numbers
router.get('/telnyx/search', async (req: AuthRequest, res: Response) => {
  try {
    if (!TELNYX_API_KEY) return res.status(400).json({ error: 'Telnyx API key not configured' });

    const { countryCode, areaCode, contains, limit } = req.query;

    const telnyx = createTelnyxService(TELNYX_API_KEY);
    const data = await telnyx.searchPhoneNumbers({
      countryCode: (countryCode as string) || 'US',
      areaCode: areaCode as string,
      contains: contains as string,
      limit: parseInt(limit as string) || 20,
    });

    const numbers = (data.data || []).map((n: any) => ({
      number: n.phone_number,
      region: n.region_information?.[0]?.region_name || '',
      type: n.phone_number_type,
      monthlyRate: n.cost_information?.monthly_cost,
      upfrontCost: n.cost_information?.upfront_cost,
      features: n.features || [],
    }));

    res.json({ numbers, total: numbers.length });
  } catch (error: any) {
    console.error('Error searching Telnyx numbers:', error.message);
    res.status(500).json({ error: 'Failed to search available numbers' });
  }
});

// POST /api/phone-numbers/telnyx/buy - Purchase a Telnyx number and import to DB
router.post('/telnyx/buy', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });
    if (!TELNYX_API_KEY) return res.status(400).json({ error: 'Telnyx API key not configured' });

    const { phoneNumber, label } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    const telnyx = createTelnyxService(TELNYX_API_KEY);
    const order = await telnyx.orderPhoneNumber(phoneNumber, TELNYX_CONNECTION_ID);

    // Auto-import into DB
    const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    const existing = await db.select().from(phoneNumbers).where(eq(phoneNumbers.number, formatted)).limit(1);
    if (existing.length === 0) {
      await db.insert(phoneNumbers).values({
        organizationId,
        number: formatted,
        provider: 'telnyx',
        providerSid: order?.data?.id || null,
        label: label || null,
        type: 'local',
        capabilities: { voice: true, sms: false },
        status: 'active',
      });
    }

    res.json({ success: true, order, number: formatted });
  } catch (error: any) {
    console.error('Error purchasing Telnyx number:', error.message);
    res.status(500).json({ error: error.response?.data?.errors?.[0]?.detail || 'Failed to purchase number' });
  }
});

// POST /api/phone-numbers/telnyx/import - Import owned Telnyx numbers into DB
router.post('/telnyx/import', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { numbers } = req.body; // Array of { number, id }
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'numbers array is required' });
    }

    const imported: string[] = [];
    const skipped: string[] = [];

    for (const num of numbers) {
      const formatted = num.number.startsWith('+') ? num.number : `+${num.number}`;
      const existing = await db.select().from(phoneNumbers).where(eq(phoneNumbers.number, formatted)).limit(1);

      if (existing.length > 0) {
        skipped.push(formatted);
        continue;
      }

      await db.insert(phoneNumbers).values({
        organizationId,
        number: formatted,
        provider: 'telnyx',
        providerSid: num.id || null,
        label: null,
        type: num.type || 'local',
        capabilities: num.capabilities || { voice: true, sms: false },
        status: 'active',
      });
      imported.push(formatted);
    }

    res.json({ success: true, imported: imported.length, skipped: skipped.length });
  } catch (error: any) {
    console.error('Error importing Telnyx numbers:', error.message);
    res.status(500).json({ error: 'Failed to import numbers' });
  }
});

// ─── AGENTS LIST (for assignment dropdown) ──────────────────────────

// GET /api/phone-numbers/agents - List agents for number assignment
router.get('/agents', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const agentList = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.organizationId, organizationId));

    res.json({ agents: agentList });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

export default router;
