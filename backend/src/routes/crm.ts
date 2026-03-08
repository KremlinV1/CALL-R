import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { crmIntegrations, crmSyncLogs, crmContactMappings } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { testCrmConnection, syncContactsFromCrm, logCallToCrm } from '../services/crm.js';

const router = Router();

// ─── CRM Integrations CRUD ──────────────────────────────────────────

// GET /api/crm — list CRM integrations
router.get('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const integrations = await db
      .select({
        id: crmIntegrations.id,
        provider: crmIntegrations.provider,
        name: crmIntegrations.name,
        instanceUrl: crmIntegrations.instanceUrl,
        accountName: crmIntegrations.accountName,
        syncContacts: crmIntegrations.syncContacts,
        syncCalls: crmIntegrations.syncCalls,
        syncAppointments: crmIntegrations.syncAppointments,
        autoCreateContacts: crmIntegrations.autoCreateContacts,
        autoLogCalls: crmIntegrations.autoLogCalls,
        isActive: crmIntegrations.isActive,
        lastSyncAt: crmIntegrations.lastSyncAt,
        lastSyncStatus: crmIntegrations.lastSyncStatus,
        lastSyncError: crmIntegrations.lastSyncError,
        createdAt: crmIntegrations.createdAt,
      })
      .from(crmIntegrations)
      .where(eq(crmIntegrations.organizationId, organizationId))
      .orderBy(desc(crmIntegrations.createdAt));

    res.json({ integrations });
  } catch (error: any) {
    console.error('Error fetching CRM integrations:', error.message);
    res.status(500).json({ error: 'Failed to fetch CRM integrations' });
  }
});

// POST /api/crm — create CRM integration
router.post('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      provider, name, accessToken, refreshToken, apiKey,
      instanceUrl, accountId, accountName,
      syncContacts, syncCalls, syncAppointments,
      autoCreateContacts, autoLogCalls,
      contactFieldMapping, callFieldMapping,
    } = req.body;

    if (!provider || !name) {
      return res.status(400).json({ error: 'provider and name are required' });
    }

    if (!['salesforce', 'hubspot', 'pipedrive'].includes(provider)) {
      return res.status(400).json({ error: 'Unsupported provider. Use: salesforce, hubspot, pipedrive' });
    }

    // In production, encrypt tokens before storing
    const [integration] = await db.insert(crmIntegrations).values({
      organizationId,
      provider,
      name,
      encryptedAccessToken: accessToken || null,
      encryptedRefreshToken: refreshToken || null,
      encryptedApiKey: apiKey || null,
      instanceUrl: instanceUrl || null,
      accountId: accountId || null,
      accountName: accountName || null,
      syncContacts: syncContacts ?? true,
      syncCalls: syncCalls ?? true,
      syncAppointments: syncAppointments ?? false,
      autoCreateContacts: autoCreateContacts ?? false,
      autoLogCalls: autoLogCalls ?? true,
      contactFieldMapping: contactFieldMapping || {},
      callFieldMapping: callFieldMapping || {},
    }).returning();

    res.status(201).json({ integration: { ...integration, encryptedAccessToken: undefined, encryptedRefreshToken: undefined, encryptedApiKey: undefined } });
  } catch (error: any) {
    console.error('Error creating CRM integration:', error.message);
    res.status(500).json({ error: 'Failed to create CRM integration' });
  }
});

// PUT /api/crm/:id — update CRM integration
router.put('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, accessToken, refreshToken, apiKey,
      instanceUrl, accountId, accountName,
      syncContacts, syncCalls, syncAppointments,
      autoCreateContacts, autoLogCalls,
      contactFieldMapping, callFieldMapping, isActive,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (accessToken !== undefined) updateData.encryptedAccessToken = accessToken;
    if (refreshToken !== undefined) updateData.encryptedRefreshToken = refreshToken;
    if (apiKey !== undefined) updateData.encryptedApiKey = apiKey;
    if (instanceUrl !== undefined) updateData.instanceUrl = instanceUrl;
    if (accountId !== undefined) updateData.accountId = accountId;
    if (accountName !== undefined) updateData.accountName = accountName;
    if (syncContacts !== undefined) updateData.syncContacts = syncContacts;
    if (syncCalls !== undefined) updateData.syncCalls = syncCalls;
    if (syncAppointments !== undefined) updateData.syncAppointments = syncAppointments;
    if (autoCreateContacts !== undefined) updateData.autoCreateContacts = autoCreateContacts;
    if (autoLogCalls !== undefined) updateData.autoLogCalls = autoLogCalls;
    if (contactFieldMapping !== undefined) updateData.contactFieldMapping = contactFieldMapping;
    if (callFieldMapping !== undefined) updateData.callFieldMapping = callFieldMapping;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(crmIntegrations)
      .set(updateData)
      .where(and(eq(crmIntegrations.id, req.params.id), eq(crmIntegrations.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Integration not found' });

    res.json({ integration: { ...updated, encryptedAccessToken: undefined, encryptedRefreshToken: undefined, encryptedApiKey: undefined } });
  } catch (error: any) {
    console.error('Error updating CRM integration:', error.message);
    res.status(500).json({ error: 'Failed to update CRM integration' });
  }
});

// DELETE /api/crm/:id — remove CRM integration
router.delete('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [updated] = await db
      .update(crmIntegrations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(crmIntegrations.id, req.params.id), eq(crmIntegrations.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Integration not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing CRM integration:', error.message);
    res.status(500).json({ error: 'Failed to remove CRM integration' });
  }
});

// ─── CRM Actions ────────────────────────────────────────────────────

// POST /api/crm/:id/test — test connection
router.post('/:id/test', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify ownership
    const [integration] = await db
      .select()
      .from(crmIntegrations)
      .where(and(eq(crmIntegrations.id, req.params.id), eq(crmIntegrations.organizationId, organizationId)))
      .limit(1);

    if (!integration) return res.status(404).json({ error: 'Integration not found' });

    const connected = await testCrmConnection(req.params.id);
    res.json({ connected });
  } catch (error: any) {
    console.error('Error testing CRM connection:', error.message);
    res.status(500).json({ error: 'Failed to test connection', connected: false });
  }
});

// POST /api/crm/:id/sync-contacts — pull contacts from CRM
router.post('/:id/sync-contacts', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await syncContactsFromCrm(req.params.id, organizationId);
    res.json({ result });
  } catch (error: any) {
    console.error('Error syncing contacts from CRM:', error.message);
    res.status(500).json({ error: error.message || 'Failed to sync contacts' });
  }
});

// POST /api/crm/:id/log-call — log a call to CRM
router.post('/:id/log-call', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { contactCrmId, subject, description, durationSeconds, direction, outcome, timestamp } = req.body;

    if (!contactCrmId || !subject) {
      return res.status(400).json({ error: 'contactCrmId and subject are required' });
    }

    const activityId = await logCallToCrm(req.params.id, {
      contactCrmId,
      subject,
      description: description || '',
      durationSeconds: durationSeconds || 0,
      direction: direction || 'outbound',
      outcome: outcome || 'completed',
      timestamp: timestamp || new Date().toISOString(),
    });

    res.json({ activityId });
  } catch (error: any) {
    console.error('Error logging call to CRM:', error.message);
    res.status(500).json({ error: 'Failed to log call to CRM' });
  }
});

// ─── Sync Logs ──────────────────────────────────────────────────────

// GET /api/crm/:id/sync-logs — get sync history
router.get('/:id/sync-logs', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const logs = await db
      .select()
      .from(crmSyncLogs)
      .where(and(eq(crmSyncLogs.integrationId, req.params.id), eq(crmSyncLogs.organizationId, organizationId)))
      .orderBy(desc(crmSyncLogs.startedAt))
      .limit(50);

    res.json({ logs });
  } catch (error: any) {
    console.error('Error fetching sync logs:', error.message);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

export default router;
