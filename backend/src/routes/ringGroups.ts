import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { ringGroups, callingHoursConfig, agents, phoneNumbers } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();

// List all ring groups
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const groups = await db
      .select()
      .from(ringGroups)
      .where(eq(ringGroups.organizationId, organizationId))
      .orderBy(desc(ringGroups.createdAt));

    res.json({ ringGroups: groups });
  } catch (error) {
    console.error('Error fetching ring groups:', error);
    res.status(500).json({ error: 'Failed to fetch ring groups' });
  }
});

// Get single ring group with resolved members
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [group] = await db
      .select()
      .from(ringGroups)
      .where(and(eq(ringGroups.id, req.params.id), eq(ringGroups.organizationId, organizationId)))
      .limit(1);

    if (!group) return res.status(404).json({ error: 'Ring group not found' });

    // Resolve member names
    const members = (group.members as any[]) || [];
    const agentIds = members.filter(m => m.type === 'agent').map(m => m.id);

    let agentNames: Record<string, string> = {};
    if (agentIds.length > 0) {
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.organizationId, organizationId));
      agentNames = Object.fromEntries(agentRows.map(a => [a.id, a.name]));
    }

    const resolvedMembers = members.map(m => ({
      ...m,
      name: m.type === 'agent' ? agentNames[m.id] || 'Unknown Agent' : m.id,
    }));

    res.json({ ringGroup: { ...group, resolvedMembers } });
  } catch (error) {
    console.error('Error fetching ring group:', error);
    res.status(500).json({ error: 'Failed to fetch ring group' });
  }
});

// Create ring group
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, description, strategy, ringTimeSeconds, members,
      fallbackAction, fallbackTarget,
      afterHoursEnabled, afterHoursAction, afterHoursTarget, callingHoursConfigId,
      holdMusicUrl, queueAnnouncement, maxQueueSize, maxWaitSeconds,
      phoneNumberIds,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    const [group] = await db.insert(ringGroups).values({
      organizationId,
      name,
      description,
      strategy: strategy || 'simultaneous',
      ringTimeSeconds: ringTimeSeconds || 30,
      members: members || [],
      fallbackAction: fallbackAction || 'voicemail',
      fallbackTarget,
      afterHoursEnabled: afterHoursEnabled || false,
      afterHoursAction: afterHoursAction || 'voicemail',
      afterHoursTarget,
      callingHoursConfigId,
      holdMusicUrl,
      queueAnnouncement,
      maxQueueSize: maxQueueSize || 10,
      maxWaitSeconds: maxWaitSeconds || 300,
      phoneNumberIds: phoneNumberIds || [],
    }).returning();

    res.status(201).json({ ringGroup: group });
  } catch (error) {
    console.error('Error creating ring group:', error);
    res.status(500).json({ error: 'Failed to create ring group' });
  }
});

// Update ring group
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, description, strategy, ringTimeSeconds, members,
      fallbackAction, fallbackTarget,
      afterHoursEnabled, afterHoursAction, afterHoursTarget, callingHoursConfigId,
      holdMusicUrl, queueAnnouncement, maxQueueSize, maxWaitSeconds,
      phoneNumberIds, isActive,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (strategy !== undefined) updateData.strategy = strategy;
    if (ringTimeSeconds !== undefined) updateData.ringTimeSeconds = ringTimeSeconds;
    if (members !== undefined) updateData.members = members;
    if (fallbackAction !== undefined) updateData.fallbackAction = fallbackAction;
    if (fallbackTarget !== undefined) updateData.fallbackTarget = fallbackTarget;
    if (afterHoursEnabled !== undefined) updateData.afterHoursEnabled = afterHoursEnabled;
    if (afterHoursAction !== undefined) updateData.afterHoursAction = afterHoursAction;
    if (afterHoursTarget !== undefined) updateData.afterHoursTarget = afterHoursTarget;
    if (callingHoursConfigId !== undefined) updateData.callingHoursConfigId = callingHoursConfigId;
    if (holdMusicUrl !== undefined) updateData.holdMusicUrl = holdMusicUrl;
    if (queueAnnouncement !== undefined) updateData.queueAnnouncement = queueAnnouncement;
    if (maxQueueSize !== undefined) updateData.maxQueueSize = maxQueueSize;
    if (maxWaitSeconds !== undefined) updateData.maxWaitSeconds = maxWaitSeconds;
    if (phoneNumberIds !== undefined) updateData.phoneNumberIds = phoneNumberIds;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(ringGroups)
      .set(updateData)
      .where(and(eq(ringGroups.id, req.params.id), eq(ringGroups.organizationId, organizationId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Ring group not found' });
    res.json({ ringGroup: updated });
  } catch (error) {
    console.error('Error updating ring group:', error);
    res.status(500).json({ error: 'Failed to update ring group' });
  }
});

// Delete ring group
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await db.delete(ringGroups).where(
      and(eq(ringGroups.id, req.params.id), eq(ringGroups.organizationId, organizationId))
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting ring group:', error);
    res.status(500).json({ error: 'Failed to delete ring group' });
  }
});

// Get available agents and numbers for member selection
router.get('/options/members', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const agentList = await db
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(eq(agents.organizationId, organizationId));

    const numberList = await db
      .select({ id: phoneNumbers.id, number: phoneNumbers.number, label: phoneNumbers.label })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.organizationId, organizationId));

    res.json({ agents: agentList, phoneNumbers: numberList });
  } catch (error) {
    console.error('Error fetching member options:', error);
    res.status(500).json({ error: 'Failed to fetch member options' });
  }
});

export default router;
