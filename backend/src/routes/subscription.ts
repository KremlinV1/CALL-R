import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { usageService, PLAN_CONFIG, PlanType } from '../services/usageService.js';
import { db } from '../db/index.js';
import { usageRecords, subscriptions } from '../db/schema.js';
import { eq, and, desc, sql, gte } from 'drizzle-orm';

const router = Router();

// Get current subscription & usage summary
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const summary = await usageService.getUsageSummary(organizationId);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Check minutes availability (lightweight check for UI)
router.get('/check-minutes', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const check = await usageService.checkMinutes(organizationId);
    res.json(check);
  } catch (error) {
    console.error('Error checking minutes:', error);
    res.status(500).json({ error: 'Failed to check minutes' });
  }
});

// Check feature access
router.get('/feature/:feature', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = await usageService.checkFeatureAccess(organizationId, req.params.feature);
    res.json({ feature: req.params.feature, allowed });
  } catch (error) {
    console.error('Error checking feature:', error);
    res.status(500).json({ error: 'Failed to check feature access' });
  }
});

// Get usage history
router.get('/usage', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { page = '1', limit = '50', startDate, endDate } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(usageRecords.organizationId, organizationId)];
    if (startDate) conditions.push(gte(usageRecords.recordedAt, new Date(startDate as string)));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(usageRecords)
      .where(and(...conditions));

    const records = await db
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.recordedAt))
      .limit(limitNum)
      .offset(offset);

    // Aggregate stats for the period
    const [periodStats] = await db
      .select({
        totalMinutes: sql<number>`coalesce(sum(${usageRecords.minutesUsed}), 0)`,
        totalSeconds: sql<number>`coalesce(sum(${usageRecords.secondsUsed}), 0)`,
        totalRecords: sql<number>`count(*)`,
        fromBonusMinutes: sql<number>`coalesce(sum(case when ${usageRecords.fromBonus} then ${usageRecords.minutesUsed} else 0 end), 0)`,
      })
      .from(usageRecords)
      .where(and(...conditions));

    res.json({
      records,
      stats: periodStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(countResult.count),
        totalPages: Math.ceil(Number(countResult.count) / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// Get daily usage breakdown (for charts)
router.get('/usage/daily', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { days = '30' } = req.query;
    const daysNum = Math.min(parseInt(days as string), 90);

    const dailyUsage = await db.execute(sql`
      SELECT
        date_trunc('day', recorded_at) as date,
        sum(minutes_used) as minutes,
        count(*) as calls
      FROM usage_records
      WHERE organization_id = ${organizationId}
        AND recorded_at >= now() - interval '${sql.raw(String(daysNum))} days'
      GROUP BY date_trunc('day', recorded_at)
      ORDER BY date ASC
    `);

    res.json({ daily: dailyUsage.rows || [] });
  } catch (error) {
    console.error('Error fetching daily usage:', error);
    res.status(500).json({ error: 'Failed to fetch daily usage' });
  }
});

// Change plan
router.post('/change-plan', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { plan } = req.body;
    if (!plan || !['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be free, pro, or enterprise.' });
    }

    const updated = await usageService.changePlan(organizationId, plan as PlanType);

    // Emit socket event
    const io = (globalThis as any).__socketIO;
    io?.to(organizationId).emit('subscription:updated', { plan });

    res.json({ subscription: updated, message: `Plan changed to ${plan}` });
  } catch (error) {
    console.error('Error changing plan:', error);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

// Add bonus minutes
router.post('/add-minutes', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { minutes } = req.body;
    if (!minutes || minutes <= 0) {
      return res.status(400).json({ error: 'minutes must be a positive number' });
    }

    const updated = await usageService.addBonusMinutes(organizationId, minutes);
    res.json({ subscription: updated, message: `Added ${minutes} bonus minutes` });
  } catch (error) {
    console.error('Error adding minutes:', error);
    res.status(500).json({ error: 'Failed to add minutes' });
  }
});

// Get available plans
router.get('/plans', async (_req: AuthRequest, res: Response) => {
  res.json({
    plans: [
      { id: 'free', name: 'Starter', price: 0, ...PLAN_CONFIG.free },
      { id: 'pro', name: 'Pro', price: 500, ...PLAN_CONFIG.pro },
      { id: 'enterprise', name: 'Enterprise', price: 1000, ...PLAN_CONFIG.enterprise },
    ],
  });
});

export default router;
