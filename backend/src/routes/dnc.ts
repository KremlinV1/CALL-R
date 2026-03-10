import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { dncList, callingHoursConfig, contacts } from '../db/schema.js';
import { eq, and, desc, sql, ilike, or, isNull, gte } from 'drizzle-orm';

const router = Router();

// ─── DNC List CRUD ────────────────────────────────────────────────

// List DNC entries with search & pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { search, reason, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(dncList.organizationId, organizationId)];
    if (search) {
      conditions.push(ilike(dncList.phoneNumber, `%${search}%`));
    }
    if (reason) {
      conditions.push(eq(dncList.reason, reason as any));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dncList)
      .where(and(...conditions));

    const entries = await db
      .select()
      .from(dncList)
      .where(and(...conditions))
      .orderBy(desc(dncList.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      entries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(countResult.count),
        totalPages: Math.ceil(Number(countResult.count) / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching DNC list:', error);
    res.status(500).json({ error: 'Failed to fetch DNC list' });
  }
});

// Check if a number is on the DNC list
router.get('/check/:phoneNumber', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const phoneNumber = req.params.phoneNumber.replace(/[^\d+]/g, '');
    const normalizedVariants = getNormalizedVariants(phoneNumber);

    const entry = await db
      .select()
      .from(dncList)
      .where(
        and(
          eq(dncList.organizationId, organizationId),
          or(...normalizedVariants.map(v => eq(dncList.phoneNumber, v))),
          or(isNull(dncList.expiresAt), gte(dncList.expiresAt, new Date()))
        )
      )
      .limit(1);

    res.json({
      blocked: entry.length > 0,
      entry: entry[0] || null,
    });
  } catch (error) {
    console.error('Error checking DNC:', error);
    res.status(500).json({ error: 'Failed to check DNC status' });
  }
});

// Check multiple numbers at once (for campaign scrubbing)
router.post('/check-batch', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { phoneNumbers } = req.body;
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: 'phoneNumbers array is required' });
    }

    // Normalize all numbers
    const normalized = phoneNumbers.map((n: string) => n.replace(/[^\d+]/g, ''));

    const blocked = await db
      .select({ phoneNumber: dncList.phoneNumber })
      .from(dncList)
      .where(
        and(
          eq(dncList.organizationId, organizationId),
          sql`${dncList.phoneNumber} = ANY(${normalized})`,
          or(isNull(dncList.expiresAt), gte(dncList.expiresAt, new Date()))
        )
      );

    const blockedSet = new Set(blocked.map(b => b.phoneNumber));

    res.json({
      results: normalized.map((n: string) => ({ phoneNumber: n, blocked: blockedSet.has(n) })),
      blockedCount: blockedSet.size,
      totalChecked: normalized.length,
    });
  } catch (error) {
    console.error('Error batch checking DNC:', error);
    res.status(500).json({ error: 'Failed to batch check DNC' });
  }
});

// Add a single number to DNC
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { phoneNumber, reason, notes, source, contactId, callId, expiresAt } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    const normalized = phoneNumber.replace(/[^\d+]/g, '');

    // Check if already exists
    const existing = await db
      .select()
      .from(dncList)
      .where(and(eq(dncList.organizationId, organizationId), eq(dncList.phoneNumber, normalized)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Number already on DNC list', entry: existing[0] });
    }

    const [entry] = await db.insert(dncList).values({
      organizationId,
      phoneNumber: normalized,
      reason: reason || 'manual',
      notes,
      source: source || 'manual',
      contactId,
      callId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    res.status(201).json({ entry });
  } catch (error) {
    console.error('Error adding to DNC:', error);
    res.status(500).json({ error: 'Failed to add to DNC list' });
  }
});

// Bulk import numbers to DNC (CSV-style)
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { numbers, reason, source } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'numbers array is required' });
    }

    // Normalize and deduplicate
    const normalized = [...new Set(
      numbers
        .map((n: any) => (typeof n === 'string' ? n : n.phoneNumber || '').replace(/[^\d+]/g, ''))
        .filter((n: string) => n.length >= 10)
    )];

    // Check existing
    const existing = await db
      .select({ phoneNumber: dncList.phoneNumber })
      .from(dncList)
      .where(
        and(
          eq(dncList.organizationId, organizationId),
          sql`${dncList.phoneNumber} = ANY(${normalized})`
        )
      );
    const existingSet = new Set(existing.map(e => e.phoneNumber));

    const toInsert = normalized
      .filter(n => !existingSet.has(n))
      .map(phoneNumber => ({
        organizationId,
        phoneNumber,
        reason: (reason || 'imported') as any,
        source: source || 'csv_import',
      }));

    let imported = 0;
    if (toInsert.length > 0) {
      // Insert in batches of 500
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500);
        await db.insert(dncList).values(batch);
        imported += batch.length;
      }
    }

    res.json({
      imported,
      skipped: existingSet.size,
      total: normalized.length,
    });
  } catch (error) {
    console.error('Error importing DNC numbers:', error);
    res.status(500).json({ error: 'Failed to import DNC numbers' });
  }
});

// Remove a number from DNC
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    await db.delete(dncList).where(
      and(eq(dncList.id, req.params.id), eq(dncList.organizationId, organizationId))
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from DNC:', error);
    res.status(500).json({ error: 'Failed to remove from DNC list' });
  }
});

// Get DNC stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        manual: sql<number>`count(*) filter (where ${dncList.reason} = 'manual')`,
        optOut: sql<number>`count(*) filter (where ${dncList.reason} = 'opt_out')`,
        dtmfOptOut: sql<number>`count(*) filter (where ${dncList.reason} = 'dtmf_opt_out')`,
        legal: sql<number>`count(*) filter (where ${dncList.reason} = 'legal')`,
        complaint: sql<number>`count(*) filter (where ${dncList.reason} = 'complaint')`,
        imported: sql<number>`count(*) filter (where ${dncList.reason} = 'imported')`,
        expired: sql<number>`count(*) filter (where ${dncList.expiresAt} < now())`,
        addedToday: sql<number>`count(*) filter (where ${dncList.createdAt} >= current_date)`,
        addedThisWeek: sql<number>`count(*) filter (where ${dncList.createdAt} >= current_date - interval '7 days')`,
      })
      .from(dncList)
      .where(eq(dncList.organizationId, organizationId));

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching DNC stats:', error);
    res.status(500).json({ error: 'Failed to fetch DNC stats' });
  }
});

// ─── Calling Hours Config ─────────────────────────────────────────

// Get calling hours config
router.get('/calling-hours', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const configs = await db
      .select()
      .from(callingHoursConfig)
      .where(eq(callingHoursConfig.organizationId, organizationId));

    res.json({ configs });
  } catch (error) {
    console.error('Error fetching calling hours:', error);
    res.status(500).json({ error: 'Failed to fetch calling hours config' });
  }
});

// Create or update calling hours
router.put('/calling-hours', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { id, name, weeklySchedule, timezone, enabled, respectContactTimezone } = req.body;

    if (id) {
      // Update existing
      const [updated] = await db
        .update(callingHoursConfig)
        .set({
          name,
          weeklySchedule,
          timezone,
          enabled,
          respectContactTimezone,
          updatedAt: new Date(),
        })
        .where(and(eq(callingHoursConfig.id, id), eq(callingHoursConfig.organizationId, organizationId)))
        .returning();
      res.json({ config: updated });
    } else {
      // Create new
      const [created] = await db.insert(callingHoursConfig).values({
        organizationId,
        name: name || 'Default',
        weeklySchedule: weeklySchedule || {},
        timezone: timezone || 'America/New_York',
        enabled: enabled !== false,
        respectContactTimezone: respectContactTimezone !== false,
      }).returning();
      res.json({ config: created });
    }
  } catch (error) {
    console.error('Error saving calling hours:', error);
    res.status(500).json({ error: 'Failed to save calling hours config' });
  }
});

// Check if current time is within calling hours for a timezone
router.get('/calling-hours/check', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { timezone } = req.query;
    const tz = (timezone as string) || 'America/New_York';

    const [config] = await db
      .select()
      .from(callingHoursConfig)
      .where(and(eq(callingHoursConfig.organizationId, organizationId), eq(callingHoursConfig.isDefault, true)))
      .limit(1);

    if (!config || !config.enabled) {
      return res.json({ allowed: true, reason: 'Calling hours not configured or disabled' });
    }

    const allowed = isWithinCallingHours(config.weeklySchedule as any, tz);
    res.json({ allowed, timezone: tz, config });
  } catch (error) {
    console.error('Error checking calling hours:', error);
    res.status(500).json({ error: 'Failed to check calling hours' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────

function getNormalizedVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = [phone];
  if (digits.length === 10) {
    variants.push(`+1${digits}`, `1${digits}`, digits);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    variants.push(`+${digits}`, digits, digits.slice(1));
  } else if (phone.startsWith('+1') && digits.length === 11) {
    variants.push(phone, digits, digits.slice(1));
  }
  return [...new Set(variants)];
}

export function isWithinCallingHours(
  weeklySchedule: Record<string, { start: string; end: string } | null>,
  timezone: string
): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || '';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const currentTime = `${hour}:${minute}`;

    const daySchedule = weeklySchedule[weekday];
    if (!daySchedule) return false; // Day is blocked

    return currentTime >= daySchedule.start && currentTime <= daySchedule.end;
  } catch {
    return true; // Default allow on error
  }
}

export default router;
