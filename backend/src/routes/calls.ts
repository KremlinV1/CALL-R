import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { calls, agents, contacts, phoneNumbers, campaigns, campaignContacts } from '../db/schema.js';
import { eq, and, desc, gte, lte, sql, or, ilike } from 'drizzle-orm';
import crypto from 'crypto';
import { OutcomeDecisionEngine } from '../services/outcomeDecisionEngine.js';
// LiveKit-only outbound provider (DIDWW trunk via LiveKit SIP)

const router = Router();

// LiveKit API configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_SIP_TRUNK_OUTBOUND = process.env.LIVEKIT_SIP_TRUNK_OUTBOUND;
const LIVEKIT_SIP_TRUNK_INBOUND = process.env.LIVEKIT_SIP_TRUNK_INBOUND;

// Phone numbers (legacy)
const VONAGE_PHONE_NUMBER = process.env.VONAGE_PHONE_NUMBER || '';
const LIVEKIT_PHONE_NUMBER = process.env.LIVEKIT_PHONE_NUMBER || '';

// Helper to create LiveKit API client
async function getLiveKitApi() {
  const { AccessToken, RoomServiceClient, SipClient } = await import('livekit-server-sdk');
  
  const roomService = new RoomServiceClient(
    LIVEKIT_URL.replace('wss://', 'https://'),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
  
  const sipClient = new SipClient(
    LIVEKIT_URL.replace('wss://', 'https://'),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );
  
  return { roomService, sipClient, AccessToken };
}

// Get all calls
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { agentId, campaignId, status, direction, outcome, startDate, endDate, search, page = '1', limit = '50' } = req.query;
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
    // Build query conditions
    const conditions = [eq(calls.organizationId, organizationId)];
    
    if (agentId) {
      conditions.push(eq(calls.agentId, agentId as string));
    }
    if (campaignId) {
      conditions.push(eq(calls.campaignId, campaignId as string));
    }
    if (status) {
      conditions.push(eq(calls.status, status as any));
    }
    if (direction) {
      conditions.push(eq(calls.direction, direction as any));
    }
    if (outcome) {
      conditions.push(eq(calls.outcome, outcome as string));
    }
    if (startDate) {
      conditions.push(gte(calls.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(calls.createdAt, new Date(endDate as string)));
    }
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions));
    const total = Number(countResult[0]?.count || 0);
    
    // Get paginated calls with agent and campaign info
    const callsResult = await db
      .select({
        id: calls.id,
        agentId: calls.agentId,
        campaignId: calls.campaignId,
        contactId: calls.contactId,
        direction: calls.direction,
        status: calls.status,
        fromNumber: calls.fromNumber,
        toNumber: calls.toNumber,
        startedAt: calls.startedAt,
        answeredAt: calls.answeredAt,
        endedAt: calls.endedAt,
        durationSeconds: calls.durationSeconds,
        recordingUrl: calls.recordingUrl,
        transcript: calls.transcript,
        summary: calls.summary,
        sentiment: calls.sentiment,
        outcome: calls.outcome,
        qualityScore: calls.qualityScore,
        costCents: calls.costCents,
        metadata: calls.metadata,
        createdAt: calls.createdAt,
        agentName: agents.name,
        campaignName: campaigns.name,
      })
      .from(calls)
      .leftJoin(agents, eq(calls.agentId, agents.id))
      .leftJoin(campaigns, eq(calls.campaignId, campaigns.id))
      .where(and(...conditions))
      .orderBy(desc(calls.createdAt))
      .limit(limitNum)
      .offset(offset);
    
    res.json({
      calls: callsResult,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Get call statistics/analytics - MUST be before /:id route
router.get('/stats/summary', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { startDate, endDate } = req.query;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const conditions = [eq(calls.organizationId, organizationId)];
    
    if (startDate) {
      conditions.push(gte(calls.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(calls.createdAt, new Date(endDate as string)));
    }
    
    // Get aggregate stats
    const stats = await db
      .select({
        totalCalls: sql<number>`count(*)`,
        completedCalls: sql<number>`count(*) filter (where ${calls.status} = 'completed')`,
        failedCalls: sql<number>`count(*) filter (where ${calls.status} = 'failed')`,
        inboundCalls: sql<number>`count(*) filter (where ${calls.direction} = 'inbound')`,
        outboundCalls: sql<number>`count(*) filter (where ${calls.direction} = 'outbound')`,
        totalDuration: sql<number>`coalesce(sum(${calls.durationSeconds}), 0)`,
        avgDuration: sql<number>`coalesce(avg(${calls.durationSeconds}), 0)`,
        totalCost: sql<number>`coalesce(sum(${calls.costCents}), 0)`,
        avgQualityScore: sql<number>`coalesce(avg(${calls.qualityScore}), 0)`,
      })
      .from(calls)
      .where(and(...conditions));
    
    const result = stats[0];
    
    res.json({
      totalCalls: Number(result.totalCalls),
      completedCalls: Number(result.completedCalls),
      failedCalls: Number(result.failedCalls),
      successRate: result.totalCalls > 0 
        ? Math.round((Number(result.completedCalls) / Number(result.totalCalls)) * 100) 
        : 0,
      inboundCalls: Number(result.inboundCalls),
      outboundCalls: Number(result.outboundCalls),
      totalDurationMinutes: Math.round(Number(result.totalDuration) / 60),
      avgDurationSeconds: Math.round(Number(result.avgDuration)),
      totalCostDollars: Number(result.totalCost) / 100,
      avgQualityScore: Math.round(Number(result.avgQualityScore) * 10) / 10,
    });
  } catch (error) {
    console.error('Error fetching call stats:', error);
    res.status(500).json({ error: 'Failed to fetch call statistics' });
  }
});

// Get single call with full details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const callResult = await db
      .select({
        id: calls.id,
        organizationId: calls.organizationId,
        agentId: calls.agentId,
        campaignId: calls.campaignId,
        contactId: calls.contactId,
        direction: calls.direction,
        status: calls.status,
        fromNumber: calls.fromNumber,
        toNumber: calls.toNumber,
        startedAt: calls.startedAt,
        answeredAt: calls.answeredAt,
        endedAt: calls.endedAt,
        durationSeconds: calls.durationSeconds,
        recordingUrl: calls.recordingUrl,
        transcript: calls.transcript,
        summary: calls.summary,
        sentiment: calls.sentiment,
        outcome: calls.outcome,
        qualityScore: calls.qualityScore,
        extractedData: calls.extractedData,
        costCents: calls.costCents,
        metadata: calls.metadata,
        createdAt: calls.createdAt,
        updatedAt: calls.updatedAt,
        agentName: agents.name,
      })
      .from(calls)
      .leftJoin(agents, eq(calls.agentId, agents.id))
      .where(
        and(
          eq(calls.id, req.params.id),
          eq(calls.organizationId, organizationId)
        )
      )
      .limit(1);
    
    if (callResult.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ call: callResult[0] });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// Proxy recording audio (LiveKit recordings are stored directly; no auth proxy needed)
router.get('/:id/recording', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [call] = await db.select({ recordingUrl: calls.recordingUrl })
      .from(calls)
      .where(and(eq(calls.id, req.params.id), eq(calls.organizationId, organizationId)))
      .limit(1);

    if (!call?.recordingUrl) {
      return res.status(404).json({ error: 'No recording found' });
    }

    // Redirect to recording URL (LiveKit stores recordings in S3/GCS with signed URLs)
    res.redirect(call.recordingUrl);
  } catch (error: any) {
    console.error('Error fetching recording:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to fetch recording' });
    }
  }
});

// Initiate outbound call — supports both Vogent and LiveKit providers
router.post('/outbound', async (req: AuthRequest, res: Response) => {
  try {
    const { agentId, toNumber, contactId, fromNumberId, provider: requestedProvider } = req.body;
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!agentId || !toNumber) {
      return res.status(400).json({ error: 'agentId and toNumber are required' });
    }
    
    // Validate agent exists
    const agentResult = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
      .limit(1);
    
    if (agentResult.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = agentResult[0];
    
    // LiveKit-only
    const callProvider = 'livekit';
    if (!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_SIP_TRUNK_OUTBOUND)) {
      return res.status(400).json({ error: 'LiveKit SIP trunk not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_SIP_TRUNK_OUTBOUND.' });
    }
    
    // Get from number (optional; LiveKit trunk CLI typically configured server-side)
    let fromNumber = '';
    if (fromNumberId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromNumberId);
      const numberResult = await db
        .select()
        .from(phoneNumbers)
        .where(and(
          isUuid ? eq(phoneNumbers.id, fromNumberId) : eq(phoneNumbers.providerSid, fromNumberId),
          eq(phoneNumbers.organizationId, organizationId)
        ))
        .limit(1);
      if (numberResult.length > 0) {
        fromNumber = numberResult[0].number;
      }
    }
    
    // Format phone number to E.164
    const formattedToNumber = toNumber.startsWith('+') ? toNumber : `+1${toNumber.replace(/\D/g, '')}`;
    
    // Create room name for the call
    const roomName = `call-${crypto.randomUUID().slice(0, 8)}`;
    
    // Insert call record
    const [newCall] = await db.insert(calls).values({
      organizationId,
      agentId,
      contactId: contactId || null,
      direction: 'outbound',
      status: 'queued',
      fromNumber,
      toNumber: formattedToNumber,
      provider: callProvider,
      metadata: {
        roomName,
        agentName: agent.name,
      },
    }).returning();

    // ── LiveKit provider (only) ─────────────────────────
    try {
      console.log('🔧 LiveKit config:', {
        hasApiKey: !!LIVEKIT_API_KEY,
        hasApiSecret: !!LIVEKIT_API_SECRET,
        trunkId: LIVEKIT_SIP_TRUNK_OUTBOUND,
        url: LIVEKIT_URL,
      });
      
      const { roomService, sipClient } = await getLiveKitApi();
      
      console.log('📞 Creating room:', roomName);
      await roomService.createRoom({
        name: roomName,
        metadata: JSON.stringify({
          callId: newCall.id,
          agentId,
          direction: 'outbound',
        }),
      });
      console.log('✅ Room created');
      
      await db.update(calls)
        .set({ status: 'ringing', startedAt: new Date() })
        .where(eq(calls.id, newCall.id));
      
      console.log('📞 Creating SIP participant:', {
        trunkId: LIVEKIT_SIP_TRUNK_OUTBOUND,
        toNumber: formattedToNumber,
        roomName,
      });
      
      const sipResult = await sipClient.createSipParticipant(
        LIVEKIT_SIP_TRUNK_OUTBOUND!,
        formattedToNumber,
        roomName,
        {
          participantIdentity: formattedToNumber,
          participantName: 'Customer',
        }
      );
      console.log('✅ SIP participant created:', sipResult);
      
      await db.update(calls)
        .set({ status: 'in_progress', answeredAt: new Date() })
        .where(eq(calls.id, newCall.id));
    } catch (livekitError) {
      console.error('❌ LiveKit error:', livekitError);
      await db.update(calls)
        .set({ status: 'failed', metadata: { ...(newCall.metadata as object), error: String(livekitError) } })
        .where(eq(calls.id, newCall.id));
    }
    
    // Emit socket event
    const io = req.app.get('io');
    io?.to(organizationId).emit('call:initiated', { 
      callId: newCall.id, 
      status: newCall.status,
      toNumber: formattedToNumber,
      agentName: agent.name,
      provider: callProvider,
    });
    
    res.status(201).json({ call: newCall, roomName, provider: callProvider });
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// End call
router.post('/:id/end', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get the call
    const callResult = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, req.params.id), eq(calls.organizationId, organizationId)))
      .limit(1);
    
    if (callResult.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const call = callResult[0];
    const endedAt = new Date();
    let durationSeconds = 0;
    
    if (call.startedAt) {
      durationSeconds = Math.floor((endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000);
    }
    
    // Update call in database
    const [updatedCall] = await db.update(calls)
      .set({
        status: 'completed',
        endedAt,
        durationSeconds,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, req.params.id))
      .returning();
    
    // End the call on the external provider
    try {
      // End the LiveKit room if exists
      const metadata = call.metadata as { roomName?: string } | null;
      if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET && metadata?.roomName) {
        const { roomService } = await getLiveKitApi();
        await roomService.deleteRoom(metadata.roomName);
      }
    } catch (providerError) {
      console.error('Error ending call on provider:', providerError);
    }
    
    // Emit socket event
    const io = req.app.get('io');
    io?.to(organizationId).emit('call:ended', { 
      callId: updatedCall.id, 
      status: 'completed',
      durationSeconds,
    });
    
    res.json({ call: updatedCall });
  } catch (error) {
    console.error('Error ending call:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

// Get call transcript
router.get('/:id/transcript', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const callResult = await db
      .select({ transcript: calls.transcript })
      .from(calls)
      .where(and(eq(calls.id, req.params.id), eq(calls.organizationId, organizationId)))
      .limit(1);
    
    if (callResult.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ transcript: callResult[0].transcript });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// Webhook endpoint for call status updates (from agent or telephony provider)
router.post('/webhook/status', async (req: AuthRequest, res: Response) => {
  try {
    const { callId, roomName, status, transcript, recordingUrl, summary, sentiment, outcome, qualityScore, extractedData } = req.body;
    
    // Find call by ID or room name
    let callQuery;
    if (callId) {
      callQuery = eq(calls.id, callId);
    } else if (roomName) {
      callQuery = sql`${calls.metadata}->>'roomName' = ${roomName}`;
    } else {
      return res.status(400).json({ error: 'callId or roomName required' });
    }
    
    const callResult = await db
      .select()
      .from(calls)
      .where(callQuery)
      .limit(1);
    
    if (callResult.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const call = callResult[0];
    const updateData: any = { updatedAt: new Date() };
    
    if (status) {
      updateData.status = status;
      if (status === 'in-progress' && !call.answeredAt) {
        updateData.answeredAt = new Date();
      }
      if (status === 'completed' || status === 'failed') {
        updateData.endedAt = new Date();
        if (call.startedAt) {
          updateData.durationSeconds = Math.floor((new Date().getTime() - new Date(call.startedAt).getTime()) / 1000);
        }
      }
    }
    
    if (transcript) updateData.transcript = transcript;
    if (recordingUrl) updateData.recordingUrl = recordingUrl;
    if (summary) updateData.summary = summary;
    if (sentiment) updateData.sentiment = sentiment;
    if (qualityScore) updateData.qualityScore = qualityScore;
    if (extractedData) updateData.extractedData = extractedData;
    
    // Use outcome decision engine to determine outcome if not explicitly provided
    if (outcome) {
      updateData.outcome = outcome;
    } else {
      // Automatically determine outcome based on call data
      const determinedOutcome = OutcomeDecisionEngine.determineOutcome({
        status: updateData.status || call.status,
        durationSeconds: updateData.durationSeconds || call.durationSeconds || undefined,
        transcript: updateData.transcript || call.transcript || undefined,
        summary: updateData.summary || call.summary || undefined,
        sentiment: updateData.sentiment || call.sentiment || undefined,
        extractedData: updateData.extractedData || call.extractedData || undefined,
        metadata: call.metadata || undefined,
      });
      
      updateData.outcome = determinedOutcome;
      console.log(`🎯 Auto-determined outcome for call ${call.id}: ${determinedOutcome}`);
    }
    
    const [updatedCall] = await db.update(calls)
      .set(updateData)
      .where(eq(calls.id, call.id))
      .returning();
    
    // Emit socket event
    const io = req.app.get('io');
    io?.to(call.organizationId).emit('call:updated', {
      callId: updatedCall.id,
      status: updatedCall.status,
      ...updateData,
    });
    
    res.json({ success: true, call: updatedCall });
  } catch (error) {
    console.error('Error updating call status:', error);
    res.status(500).json({ error: 'Failed to update call status' });
  }
});

export default router;
