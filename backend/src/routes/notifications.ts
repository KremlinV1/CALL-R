import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { notificationChannels, notificationLogs } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { sendTestNotification } from '../services/notifications.js';

const router = Router();

// ─── Notification Channels CRUD ─────────────────────────────────────

// GET /api/notifications/channels — list channels
router.get('/channels', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const channels = await db
      .select({
        id: notificationChannels.id,
        name: notificationChannels.name,
        channelType: notificationChannels.channelType,
        subscribedEvents: notificationChannels.subscribedEvents,
        agentIds: notificationChannels.agentIds,
        campaignIds: notificationChannels.campaignIds,
        isActive: notificationChannels.isActive,
        createdAt: notificationChannels.createdAt,
        updatedAt: notificationChannels.updatedAt,
      })
      .from(notificationChannels)
      .where(eq(notificationChannels.organizationId, organizationId))
      .orderBy(desc(notificationChannels.createdAt));

    res.json({ channels });
  } catch (error: any) {
    console.error('Error fetching notification channels:', error.message);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// POST /api/notifications/channels — create channel
router.post('/channels', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, channelType, config, subscribedEvents, agentIds, campaignIds } = req.body;

    if (!name || !channelType) {
      return res.status(400).json({ error: 'name and channelType are required' });
    }

    if (!['slack', 'email', 'sms', 'teams', 'discord', 'webhook'].includes(channelType)) {
      return res.status(400).json({ error: 'Invalid channelType' });
    }

    const [channel] = await db.insert(notificationChannels).values({
      organizationId,
      name,
      channelType,
      config: config || {},
      subscribedEvents: subscribedEvents || [],
      agentIds: agentIds || [],
      campaignIds: campaignIds || [],
    }).returning();

    res.status(201).json({
      channel: { ...channel, config: undefined }, // Don't return config with secrets
    });
  } catch (error: any) {
    console.error('Error creating notification channel:', error.message);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PUT /api/notifications/channels/:id — update channel
router.put('/channels/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, config, subscribedEvents, agentIds, campaignIds, isActive } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (config !== undefined) updateData.config = config;
    if (subscribedEvents !== undefined) updateData.subscribedEvents = subscribedEvents;
    if (agentIds !== undefined) updateData.agentIds = agentIds;
    if (campaignIds !== undefined) updateData.campaignIds = campaignIds;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(notificationChannels)
      .set(updateData)
      .where(and(eq(notificationChannels.id, req.params.id), eq(notificationChannels.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Channel not found' });

    res.json({ channel: { ...updated, config: undefined } });
  } catch (error: any) {
    console.error('Error updating notification channel:', error.message);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/notifications/channels/:id — remove channel
router.delete('/channels/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [deleted] = await db
      .update(notificationChannels)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(notificationChannels.id, req.params.id), eq(notificationChannels.organizationId, organizationId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Channel not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing notification channel:', error.message);
    res.status(500).json({ error: 'Failed to remove channel' });
  }
});

// ─── Channel Actions ────────────────────────────────────────────────

// POST /api/notifications/channels/:id/test — send test notification
router.post('/channels/:id/test', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const success = await sendTestNotification(req.params.id, organizationId);
    res.json({ success });
  } catch (error: any) {
    console.error('Error testing notification channel:', error.message);
    res.status(500).json({ error: error.message || 'Test failed', success: false });
  }
});

// ─── Notification Logs ──────────────────────────────────────────────

// GET /api/notifications/logs — list recent logs
router.get('/logs', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const channelId = req.query.channelId;

    let query = db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.organizationId, organizationId))
      .orderBy(desc(notificationLogs.sentAt))
      .limit(100);

    let logs = await query;

    if (channelId) {
      logs = logs.filter(l => l.channelId === channelId);
    }

    res.json({ logs });
  } catch (error: any) {
    console.error('Error fetching notification logs:', error.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ─── Available Events ───────────────────────────────────────────────

// GET /api/notifications/events — list all subscribable event types
router.get('/events', async (_req: any, res: Response) => {
  res.json({
    events: [
      { type: 'call.completed', label: 'Call Completed', description: 'When a call finishes' },
      { type: 'call.failed', label: 'Call Failed', description: 'When a call fails or errors' },
      { type: 'call.voicemail', label: 'Voicemail Detected', description: 'When a call reaches voicemail' },
      { type: 'call.transferred', label: 'Call Transferred', description: 'When a call is transferred' },
      { type: 'campaign.completed', label: 'Campaign Completed', description: 'When a campaign finishes all calls' },
      { type: 'campaign.started', label: 'Campaign Started', description: 'When a campaign begins' },
      { type: 'appointment.booked', label: 'Appointment Booked', description: 'When a new appointment is created' },
      { type: 'appointment.cancelled', label: 'Appointment Cancelled', description: 'When an appointment is cancelled' },
      { type: 'workflow.completed', label: 'Workflow Completed', description: 'When a workflow execution finishes' },
      { type: 'workflow.failed', label: 'Workflow Failed', description: 'When a workflow execution fails' },
      { type: 'agent.error', label: 'Agent Error', description: 'When an AI agent encounters an error' },
    ],
  });
});

export default router;
