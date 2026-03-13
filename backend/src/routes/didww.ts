import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { createDIDWWService } from '../services/didww.js';
import { db } from '../db/index.js';
import { phoneNumbers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// ─── ACCOUNT ─────────────────────────────────────────────────────────

// GET /api/didww/balance
router.get('/balance', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.getBalance();
    const balance = data?.data?.attributes || {};
    res.json({ balance: balance.balance, currency: balance.currency });
  } catch (error: any) {
    console.error('DIDWW balance error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch DIDWW balance' });
  }
});

// ─── DID NUMBERS ─────────────────────────────────────────────────────

// GET /api/didww/dids - List owned DIDs from DIDWW account
router.get('/dids', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.listDIDs({ pageSize: 100 });

    const numbers = (data.data || []).map((d: any) => ({
      id: d.id,
      number: d.attributes.number,
      status: d.attributes.status || 'active',
      type: d.attributes.did_group_type || 'local',
      capacityLimit: d.attributes.capacity_limit,
      expiresAt: d.attributes.expires_at,
      createdAt: d.attributes.created_at,
      trunkId: d.relationships?.voice_in_trunk?.data?.id || null,
      trunkGroupId: d.relationships?.voice_in_trunk_group?.data?.id || null,
    }));

    res.json({ numbers, total: numbers.length });
  } catch (error: any) {
    console.error('DIDWW list DIDs error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to list DIDWW numbers' });
  }
});

// GET /api/didww/dids/search - Search available DIDs
router.get('/dids/search', async (req: AuthRequest, res: Response) => {
  try {
    const { didGroupId, countryId, cityId, pageSize } = req.query;
    const didww = createDIDWWService();

    const data = await didww.searchAvailableDIDs({
      didGroupId: didGroupId as string,
      countryId: countryId as string,
      cityId: cityId as string,
      pageSize: parseInt(pageSize as string) || 20,
    });

    const numbers = (data.data || []).map((d: any) => ({
      id: d.id,
      number: d.attributes.number,
      type: d.attributes.did_group_type || 'local',
    }));

    res.json({ numbers, total: numbers.length });
  } catch (error: any) {
    console.error('DIDWW search DIDs error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search DIDWW numbers' });
  }
});

// GET /api/didww/did-groups - List available DID groups (coverage)
router.get('/did-groups', async (req: AuthRequest, res: Response) => {
  try {
    const { countryId, cityId, areaCode, prefix, pageSize } = req.query;
    const didww = createDIDWWService();

    const data = await didww.listDIDGroups({
      countryId: countryId as string,
      cityId: cityId as string,
      areaCode: areaCode as string,
      prefix: prefix as string,
      pageSize: parseInt(pageSize as string) || 20,
    });

    const groups = (data.data || []).map((g: any) => ({
      id: g.id,
      areaCode: g.attributes.area_code,
      prefix: g.attributes.prefix,
      stockAvailable: g.attributes.is_available,
      features: g.attributes.features,
      monthlyPrice: g.attributes.monthly_price,
      setupPrice: g.attributes.setup_price,
    }));

    res.json({ groups, total: groups.length });
  } catch (error: any) {
    console.error('DIDWW DID groups error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch DID groups' });
  }
});

// GET /api/didww/countries - List DIDWW countries
router.get('/countries', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.listCountries();

    const countries = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.attributes.name,
      iso: c.attributes.iso,
      prefix: c.attributes.prefix,
    }));

    res.json({ countries });
  } catch (error: any) {
    console.error('DIDWW countries error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// POST /api/didww/dids/import - Import DIDWW DIDs into local DB
router.post('/dids/import', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { numbers } = req.body;
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
        provider: 'didww',
        providerSid: num.id || null,
        label: null,
        type: num.type || 'local',
        capabilities: { voice: true, sms: false },
        status: 'active',
      });
      imported.push(formatted);
    }

    res.json({ success: true, imported: imported.length, skipped: skipped.length });
  } catch (error: any) {
    console.error('DIDWW import error:', error.message);
    res.status(500).json({ error: 'Failed to import DIDWW numbers' });
  }
});

// ─── VOICE IN TRUNKS (Inbound) ──────────────────────────────────────

// GET /api/didww/trunks/in
router.get('/trunks/in', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.listVoiceInTrunks();

    const trunks = (data.data || []).map((t: any) => ({
      id: t.id,
      name: t.attributes.name,
      priority: t.attributes.priority,
      weight: t.attributes.weight,
      capacityLimit: t.attributes.capacity_limit,
      cliFormat: t.attributes.cli_format,
      description: t.attributes.description,
      ringingTimeout: t.attributes.ringing_timeout,
      createdAt: t.attributes.created_at,
      configuration: t.attributes.configuration,
    }));

    res.json({ trunks, total: trunks.length });
  } catch (error: any) {
    console.error('DIDWW list inbound trunks error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to list inbound trunks' });
  }
});

// POST /api/didww/trunks/in - Create inbound SIP trunk
router.post('/trunks/in', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.createVoiceInTrunk(req.body);
    res.status(201).json({ trunk: data.data });
  } catch (error: any) {
    console.error('DIDWW create inbound trunk error:', error?.response?.data || error.message);
    const detail = error?.response?.data?.errors?.[0]?.detail || 'Failed to create inbound trunk';
    res.status(500).json({ error: detail });
  }
});

// PATCH /api/didww/trunks/in/:id
router.patch('/trunks/in/:id', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.updateVoiceInTrunk(req.params.id, req.body);
    res.json({ trunk: data.data });
  } catch (error: any) {
    console.error('DIDWW update inbound trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update inbound trunk' });
  }
});

// DELETE /api/didww/trunks/in/:id
router.delete('/trunks/in/:id', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    await didww.deleteVoiceInTrunk(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('DIDWW delete inbound trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete inbound trunk' });
  }
});

// ─── VOICE OUT TRUNKS (Outbound) ────────────────────────────────────

// GET /api/didww/trunks/out
router.get('/trunks/out', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.listVoiceOutTrunks();

    const trunks = (data.data || []).map((t: any) => ({
      id: t.id,
      name: t.attributes.name,
      username: t.attributes.username,
      password: t.attributes.password,
      allowedSipIps: t.attributes.allowed_sip_ips,
      allowedRtpIps: t.attributes.allowed_rtp_ips,
      allowAnyDidAsCli: t.attributes.allow_any_did_as_cli,
      onCliMismatchAction: t.attributes.on_cli_mismatch_action,
      capacityLimit: t.attributes.capacity_limit,
      status: t.attributes.status,
      thresholdAmount: t.attributes.threshold_amount,
      thresholdReached: t.attributes.threshold_reached,
      mediaEncryptionMode: t.attributes.media_encryption_mode,
      createdAt: t.attributes.created_at,
    }));

    res.json({ trunks, total: trunks.length });
  } catch (error: any) {
    console.error('DIDWW list outbound trunks error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to list outbound trunks' });
  }
});

// POST /api/didww/trunks/out - Create outbound SIP trunk
router.post('/trunks/out', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.createVoiceOutTrunk(req.body);
    res.json({ trunk: data.data });
  } catch (error: any) {
    console.error('DIDWW create outbound trunk error:', error?.response?.data || error.message);
    const detail = error?.response?.data?.errors?.[0]?.detail || 'Failed to create outbound trunk';
    res.status(500).json({ error: detail });
  }
});

// PATCH /api/didww/trunks/out/:id
router.patch('/trunks/out/:id', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.updateVoiceOutTrunk(req.params.id, req.body);
    res.json({ trunk: data.data });
  } catch (error: any) {
    console.error('DIDWW update outbound trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update outbound trunk' });
  }
});

// DELETE /api/didww/trunks/out/:id
router.delete('/trunks/out/:id', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    await didww.deleteVoiceOutTrunk(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('DIDWW delete outbound trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete outbound trunk' });
  }
});

// ─── TRUNK GROUPS ───────────────────────────────────────────────────

// GET /api/didww/trunk-groups
router.get('/trunk-groups', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.listVoiceInTrunkGroups();

    const groups = (data.data || []).map((g: any) => ({
      id: g.id,
      name: g.attributes.name,
      createdAt: g.attributes.created_at,
    }));

    res.json({ groups, total: groups.length });
  } catch (error: any) {
    console.error('DIDWW list trunk groups error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to list trunk groups' });
  }
});

// ─── DID ↔ TRUNK ASSIGNMENT ────────────────────────────────────────

// POST /api/didww/dids/:didId/assign-trunk
router.post('/dids/:didId/assign-trunk', async (req: AuthRequest, res: Response) => {
  try {
    const { trunkId, trunkType } = req.body;
    if (!trunkId || !trunkType) {
      return res.status(400).json({ error: 'trunkId and trunkType are required' });
    }

    const didww = createDIDWWService();
    const data = await didww.assignTrunkToDID(req.params.didId, trunkId, trunkType);
    res.json({ success: true, did: data.data });
  } catch (error: any) {
    console.error('DIDWW assign trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to assign trunk to DID' });
  }
});

// POST /api/didww/dids/:didId/unassign-trunk
router.post('/dids/:didId/unassign-trunk', async (req: AuthRequest, res: Response) => {
  try {
    const didww = createDIDWWService();
    const data = await didww.unassignTrunkFromDID(req.params.didId);
    res.json({ success: true, did: data.data });
  } catch (error: any) {
    console.error('DIDWW unassign trunk error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to unassign trunk from DID' });
  }
});

export default router;
