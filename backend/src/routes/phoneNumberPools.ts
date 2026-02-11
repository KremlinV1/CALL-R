import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { phoneNumberPools, poolPhoneNumbers, phoneNumbers } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { phoneNumberRotation } from '../services/phoneNumberRotation.js';

const router = Router();

// Create pool schema
const createPoolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rotationStrategy: z.enum(['round_robin', 'random', 'least_used', 'weighted']).default('round_robin'),
  rotationIntervalMinutes: z.number().int().min(1).max(1440).default(60),
  maxCallsPerNumber: z.number().int().min(1).max(10000).default(100),
  cooldownMinutes: z.number().int().min(0).max(1440).default(30),
});

// Add numbers to pool schema
const addNumbersSchema = z.object({
  phoneNumberIds: z.array(z.string().uuid()).min(1),
});

// Get all pools
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pools = await db.select({
      id: phoneNumberPools.id,
      name: phoneNumberPools.name,
      description: phoneNumberPools.description,
      rotationStrategy: phoneNumberPools.rotationStrategy,
      rotationIntervalMinutes: phoneNumberPools.rotationIntervalMinutes,
      maxCallsPerNumber: phoneNumberPools.maxCallsPerNumber,
      cooldownMinutes: phoneNumberPools.cooldownMinutes,
      isActive: phoneNumberPools.isActive,
      totalCalls: phoneNumberPools.totalCalls,
      activeNumbers: phoneNumberPools.activeNumbers,
      createdAt: phoneNumberPools.createdAt,
      updatedAt: phoneNumberPools.updatedAt,
    })
    .from(phoneNumberPools)
    .where(eq(phoneNumberPools.organizationId, req.user!.organizationId))
    .orderBy(desc(phoneNumberPools.createdAt));
    
    res.json({ pools });
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ error: 'Failed to fetch phone number pools' });
  }
});

// Get single pool with numbers
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    // Get numbers in this pool
    const numbers = await db.select({
      id: poolPhoneNumbers.id,
      phoneNumberId: poolPhoneNumbers.phoneNumberId,
      number: phoneNumbers.number,
      provider: phoneNumbers.provider,
      callsMade: poolPhoneNumbers.callsMade,
      lastUsedAt: poolPhoneNumbers.lastUsedAt,
      isHealthy: poolPhoneNumbers.isHealthy,
      spamScore: poolPhoneNumbers.spamScore,
      cooldownUntil: poolPhoneNumbers.cooldownUntil,
      weight: poolPhoneNumbers.weight,
      isActive: poolPhoneNumbers.isActive,
    })
    .from(poolPhoneNumbers)
    .leftJoin(phoneNumbers, eq(poolPhoneNumbers.phoneNumberId, phoneNumbers.id))
    .where(eq(poolPhoneNumbers.poolId, req.params.id));
    
    res.json({ pool, numbers });
  } catch (error) {
    console.error('Error fetching pool:', error);
    res.status(500).json({ error: 'Failed to fetch pool' });
  }
});

// Create pool
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createPoolSchema.parse(req.body);
    
    const [pool] = await db.insert(phoneNumberPools).values({
      organizationId: req.user!.organizationId,
      name: data.name,
      description: data.description || '',
      rotationStrategy: data.rotationStrategy,
      rotationIntervalMinutes: data.rotationIntervalMinutes,
      maxCallsPerNumber: data.maxCallsPerNumber,
      cooldownMinutes: data.cooldownMinutes,
    }).returning();
    
    res.status(201).json({ pool });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating pool:', error);
    res.status(500).json({ error: 'Failed to create pool' });
  }
});

// Update pool
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    const data = createPoolSchema.partial().parse(req.body);
    
    const [updatedPool] = await db.update(phoneNumberPools)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(phoneNumberPools.id, req.params.id))
      .returning();
    
    res.json({ pool: updatedPool });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating pool:', error);
    res.status(500).json({ error: 'Failed to update pool' });
  }
});

// Add phone numbers to pool
router.post('/:id/numbers', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    const { phoneNumberIds } = addNumbersSchema.parse(req.body);
    
    // Verify all phone numbers belong to the organization
    const orgNumbers = await db.select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(and(
        eq(phoneNumbers.organizationId, req.user!.organizationId),
        sql`${phoneNumbers.id} = ANY(${phoneNumberIds})`
      ));
    
    if (orgNumbers.length !== phoneNumberIds.length) {
      res.status(400).json({ error: 'Some phone numbers not found or not owned by organization' });
      return;
    }
    
    // Check for duplicates already in pool
    const existing = await db.select({ phoneNumberId: poolPhoneNumbers.phoneNumberId })
      .from(poolPhoneNumbers)
      .where(and(
        eq(poolPhoneNumbers.poolId, req.params.id),
        sql`${poolPhoneNumbers.phoneNumberId} = ANY(${phoneNumberIds})`
      ));
    
    const existingIds = new Set(existing.map(e => e.phoneNumberId));
    const newIds = phoneNumberIds.filter(id => !existingIds.has(id));
    
    if (newIds.length === 0) {
      res.status(400).json({ error: 'All phone numbers already in pool' });
      return;
    }
    
    // Add numbers to pool
    await db.insert(poolPhoneNumbers).values(
      newIds.map(phoneNumberId => ({
        poolId: req.params.id,
        phoneNumberId,
      }))
    );
    
    // Update pool active numbers count
    await db.update(phoneNumberPools)
      .set({
        activeNumbers: sql`${phoneNumberPools.activeNumbers} + ${newIds.length}`,
        updatedAt: new Date(),
      })
      .where(eq(phoneNumberPools.id, req.params.id));
    
    res.json({ message: 'Phone numbers added to pool', added: newIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error adding numbers to pool:', error);
    res.status(500).json({ error: 'Failed to add numbers to pool' });
  }
});

// Remove phone number from pool
router.delete('/:id/numbers/:phoneNumberId', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    await db.delete(poolPhoneNumbers)
      .where(and(
        eq(poolPhoneNumbers.poolId, req.params.id),
        eq(poolPhoneNumbers.phoneNumberId, req.params.phoneNumberId)
      ));
    
    // Update pool active numbers count
    await db.update(phoneNumberPools)
      .set({
        activeNumbers: sql`GREATEST(0, ${phoneNumberPools.activeNumbers} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(phoneNumberPools.id, req.params.id));
    
    res.json({ message: 'Phone number removed from pool' });
  } catch (error) {
    console.error('Error removing number from pool:', error);
    res.status(500).json({ error: 'Failed to remove number from pool' });
  }
});

// Get pool statistics
router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    const stats = await phoneNumberRotation.getPoolStats(req.params.id);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching pool stats:', error);
    res.status(500).json({ error: 'Failed to fetch pool statistics' });
  }
});

// Reset pool cooldowns
router.post('/:id/reset-cooldowns', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    await phoneNumberRotation.resetCooldowns(req.params.id);
    res.json({ message: 'Cooldowns reset successfully' });
  } catch (error) {
    console.error('Error resetting cooldowns:', error);
    res.status(500).json({ error: 'Failed to reset cooldowns' });
  }
});

// Delete pool
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [pool] = await db.select()
      .from(phoneNumberPools)
      .where(and(
        eq(phoneNumberPools.id, req.params.id),
        eq(phoneNumberPools.organizationId, req.user!.organizationId)
      ));
    
    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }
    
    await db.delete(phoneNumberPools)
      .where(eq(phoneNumberPools.id, req.params.id));
    
    res.json({ message: 'Pool deleted successfully' });
  } catch (error) {
    console.error('Error deleting pool:', error);
    res.status(500).json({ error: 'Failed to delete pool' });
  }
});

export default router;
