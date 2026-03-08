import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { callerIdProfiles } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// GET /api/caller-id — list all caller ID profiles
router.get('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const profiles = await db
      .select()
      .from(callerIdProfiles)
      .where(and(
        eq(callerIdProfiles.organizationId, organizationId),
        eq(callerIdProfiles.isActive, true),
      ))
      .orderBy(desc(callerIdProfiles.priority));

    res.json({ profiles });
  } catch (error: any) {
    console.error('Error fetching caller ID profiles:', error.message);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// GET /api/caller-id/:id — get single profile
router.get('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [profile] = await db
      .select()
      .from(callerIdProfiles)
      .where(and(
        eq(callerIdProfiles.id, req.params.id),
        eq(callerIdProfiles.organizationId, organizationId),
      ))
      .limit(1);

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    res.json({ profile });
  } catch (error: any) {
    console.error('Error fetching caller ID profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// POST /api/caller-id — create profile
router.post('/', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      displayNumber,
      displayName,
      mode,
      isDefault,
      agentIds,
      campaignIds,
      matchAreaCodes,
      priority,
    } = req.body;

    if (!name || !displayNumber) {
      return res.status(400).json({ error: 'name and displayNumber are required' });
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await db
        .update(callerIdProfiles)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(callerIdProfiles.organizationId, organizationId),
          eq(callerIdProfiles.isDefault, true),
        ));
    }

    // Format display number to E.164
    const formattedNumber = displayNumber.startsWith('+')
      ? displayNumber
      : `+1${displayNumber.replace(/\D/g, '')}`;

    const [profile] = await db.insert(callerIdProfiles).values({
      organizationId,
      name,
      displayNumber: formattedNumber,
      displayName: displayName || null,
      mode: mode || 'owned',
      isDefault: isDefault || false,
      agentIds: agentIds || [],
      campaignIds: campaignIds || [],
      matchAreaCodes: matchAreaCodes || [],
      priority: priority || 0,
    }).returning();

    res.status(201).json({ profile });
  } catch (error: any) {
    console.error('Error creating caller ID profile:', error.message);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// PUT /api/caller-id/:id — update profile
router.put('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      displayNumber,
      displayName,
      mode,
      isDefault,
      agentIds,
      campaignIds,
      matchAreaCodes,
      priority,
      isActive,
    } = req.body;

    // If setting as default, unset other defaults first
    if (isDefault) {
      await db
        .update(callerIdProfiles)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(callerIdProfiles.organizationId, organizationId),
          eq(callerIdProfiles.isDefault, true),
        ));
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (displayNumber !== undefined) {
      updateData.displayNumber = displayNumber.startsWith('+')
        ? displayNumber
        : `+1${displayNumber.replace(/\D/g, '')}`;
    }
    if (displayName !== undefined) updateData.displayName = displayName;
    if (mode !== undefined) updateData.mode = mode;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (agentIds !== undefined) updateData.agentIds = agentIds;
    if (campaignIds !== undefined) updateData.campaignIds = campaignIds;
    if (matchAreaCodes !== undefined) updateData.matchAreaCodes = matchAreaCodes;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(callerIdProfiles)
      .set(updateData)
      .where(and(
        eq(callerIdProfiles.id, req.params.id),
        eq(callerIdProfiles.organizationId, organizationId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Profile not found' });

    res.json({ profile: updated });
  } catch (error: any) {
    console.error('Error updating caller ID profile:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /api/caller-id/:id — soft-delete (deactivate)
router.delete('/:id', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const [updated] = await db
      .update(callerIdProfiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(callerIdProfiles.id, req.params.id),
        eq(callerIdProfiles.organizationId, organizationId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Profile not found' });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting caller ID profile:', error.message);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// POST /api/caller-id/:id/set-default — set as org default
router.post('/:id/set-default', async (req: any, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Unset all defaults
    await db
      .update(callerIdProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(
        eq(callerIdProfiles.organizationId, organizationId),
        eq(callerIdProfiles.isDefault, true),
      ));

    // Set new default
    const [updated] = await db
      .update(callerIdProfiles)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(
        eq(callerIdProfiles.id, req.params.id),
        eq(callerIdProfiles.organizationId, organizationId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Profile not found' });

    res.json({ profile: updated });
  } catch (error: any) {
    console.error('Error setting default:', error.message);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

export default router;
