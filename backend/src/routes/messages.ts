import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { messages, contacts, agents, phoneNumbers } from '../db/schema.js';
import { eq, and, desc, sql, ilike, or, inArray } from 'drizzle-orm';
import { createTelnyxService } from '../services/telnyx.js';

const router = Router();
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';

// ─── List Messages (conversation threads) ─────────────────────────

// List messages with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { contactId, direction, status, search, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(messages.organizationId, organizationId)];
    if (contactId) conditions.push(eq(messages.contactId, contactId as string));
    if (direction) conditions.push(eq(messages.direction, direction as any));
    if (status) conditions.push(eq(messages.status, status as any));
    if (search) {
      conditions.push(or(
        ilike(messages.body, `%${search}%`),
        ilike(messages.toNumber, `%${search}%`),
        ilike(messages.fromNumber, `%${search}%`),
      ));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(...conditions));

    const messageList = await db
      .select({
        id: messages.id,
        contactId: messages.contactId,
        agentId: messages.agentId,
        campaignId: messages.campaignId,
        direction: messages.direction,
        status: messages.status,
        fromNumber: messages.fromNumber,
        toNumber: messages.toNumber,
        body: messages.body,
        provider: messages.provider,
        externalId: messages.externalId,
        mediaUrls: messages.mediaUrls,
        costCents: messages.costCents,
        segments: messages.segments,
        errorCode: messages.errorCode,
        errorMessage: messages.errorMessage,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      messages: messageList,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(countResult.count),
        totalPages: Math.ceil(Number(countResult.count) / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get conversation thread for a contact
router.get('/thread/:contactId', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const thread = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, organizationId),
          eq(messages.contactId, req.params.contactId),
        )
      )
      .orderBy(messages.createdAt);

    // Get contact info
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, req.params.contactId), eq(contacts.organizationId, organizationId)))
      .limit(1);

    res.json({ messages: thread, contact });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'Failed to fetch conversation thread' });
  }
});

// Get recent conversations (unique contacts with latest message)
router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    // Get latest message per contact
    const conversations = await db.execute(sql`
      SELECT DISTINCT ON (m.contact_id)
        m.id, m.contact_id, m.direction, m.status, m.from_number, m.to_number,
        m.body, m.created_at,
        c.first_name, c.last_name, c.phone, c.company
      FROM ${messages} m
      LEFT JOIN ${contacts} c ON m.contact_id = c.id
      WHERE m.organization_id = ${organizationId}
        AND m.contact_id IS NOT NULL
      ORDER BY m.contact_id, m.created_at DESC
    `);

    res.json({ conversations: conversations.rows || [] });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ─── Send SMS ─────────────────────────────────────────────────────

router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { toNumber, fromNumber, fromNumberId, body, contactId, agentId, campaignId } = req.body;
    if (!toNumber || !body) {
      return res.status(400).json({ error: 'toNumber and body are required' });
    }

    // Resolve from number
    let resolvedFrom = fromNumber || '';
    if (!resolvedFrom && fromNumberId) {
      const [num] = await db
        .select({ number: phoneNumbers.number })
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.id, fromNumberId), eq(phoneNumbers.organizationId, organizationId)))
        .limit(1);
      if (num) resolvedFrom = num.number;
    }

    if (!resolvedFrom) {
      // Fall back to first SMS-capable number
      const [firstNum] = await db
        .select({ number: phoneNumbers.number })
        .from(phoneNumbers)
        .where(eq(phoneNumbers.organizationId, organizationId))
        .limit(1);
      if (firstNum) resolvedFrom = firstNum.number;
    }

    if (!resolvedFrom) {
      return res.status(400).json({ error: 'No from number available. Add a phone number first.' });
    }

    const formattedTo = toNumber.startsWith('+') ? toNumber : `+1${toNumber.replace(/\D/g, '')}`;

    // Create message record
    const [msg] = await db.insert(messages).values({
      organizationId,
      contactId: contactId || null,
      agentId: agentId || null,
      campaignId: campaignId || null,
      direction: 'outbound',
      status: 'queued',
      fromNumber: resolvedFrom,
      toNumber: formattedTo,
      body,
      provider: 'telnyx',
    }).returning();

    // Send via Telnyx
    if (TELNYX_API_KEY) {
      try {
        const telnyx = createTelnyxService(TELNYX_API_KEY);
        const result = await telnyx.sendSMS(resolvedFrom, formattedTo, body);

        await db.update(messages).set({
          status: 'sent',
          externalId: result.id || null,
          sentAt: new Date(),
        }).where(eq(messages.id, msg.id));

        msg.status = 'sent' as any;
        msg.sentAt = new Date();
      } catch (sendErr: any) {
        await db.update(messages).set({
          status: 'failed',
          errorMessage: sendErr.message,
        }).where(eq(messages.id, msg.id));

        msg.status = 'failed' as any;
        msg.errorMessage = sendErr.message;
      }
    } else {
      await db.update(messages).set({ status: 'failed', errorMessage: 'TELNYX_API_KEY not configured' }).where(eq(messages.id, msg.id));
      return res.status(500).json({ error: 'SMS provider not configured' });
    }

    // Emit socket event
    const io = (globalThis as any).__socketIO;
    io?.to(organizationId).emit('message:sent', { messageId: msg.id, toNumber: formattedTo });

    res.json({ message: msg });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Get SMS stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        sent: sql<number>`count(*) filter (where ${messages.status} = 'sent')`,
        delivered: sql<number>`count(*) filter (where ${messages.status} = 'delivered')`,
        failed: sql<number>`count(*) filter (where ${messages.status} = 'failed')`,
        received: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')`,
        outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
        totalCost: sql<number>`coalesce(sum(${messages.costCents}), 0)`,
      })
      .from(messages)
      .where(eq(messages.organizationId, organizationId));

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching message stats:', error);
    res.status(500).json({ error: 'Failed to fetch message stats' });
  }
});

export default router;
