import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { calls, agents, contacts, phoneNumbers, campaigns, campaignContacts, telephonyConfig } from '../db/schema.js';
import { eq, and, desc, gte, lte, sql, or, ilike } from 'drizzle-orm';
import crypto from 'crypto';
import { OutcomeDecisionEngine } from '../services/outcomeDecisionEngine.js';
import { vogentService } from '../services/vogent.js';
import { dashaService } from '../services/dasha.js';
import { decryptApiKey } from '../utils/crypto.js';

const router = Router();

// LiveKit API configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_SIP_TRUNK_OUTBOUND = process.env.LIVEKIT_SIP_TRUNK_OUTBOUND;
const LIVEKIT_SIP_TRUNK_INBOUND = process.env.LIVEKIT_SIP_TRUNK_INBOUND;

// Phone numbers
const VONAGE_PHONE_NUMBER = process.env.VONAGE_PHONE_NUMBER || '';
const LIVEKIT_PHONE_NUMBER = process.env.LIVEKIT_PHONE_NUMBER || '';

// Vogent env-var fallbacks (used when no DB config exists)
const VOGENT_API_KEY_ENV = process.env.VOGENT_API_KEY;
const VOGENT_BASE_AGENT_ID_ENV = process.env.VOGENT_BASE_AGENT_ID;
const VOGENT_PHONE_NUMBER_ID_ENV = process.env.VOGENT_PHONE_NUMBER_ID;
const VOGENT_PHONE_NUMBER_ENV = process.env.VOGENT_PHONE_NUMBER || '';
const VOGENT_DEFAULT_MODEL_ID_ENV = process.env.VOGENT_DEFAULT_MODEL_ID || '';

// Cache for auto-fetched Vogent model ID
let cachedVogentModelId: string | null = null;

// Load Vogent credentials from DB (per-org), falling back to env vars
async function getVogentConfig(organizationId: string) {
  const config = await db
    .select({
      encryptedApiKey: telephonyConfig.encryptedApiKey,
      vogentBaseAgentId: telephonyConfig.vogentBaseAgentId,
      vogentPhoneNumberId: telephonyConfig.vogentPhoneNumberId,
      vogentDefaultModelId: telephonyConfig.vogentDefaultModelId,
      provider: telephonyConfig.provider,
    })
    .from(telephonyConfig)
    .where(eq(telephonyConfig.organizationId, organizationId))
    .limit(1);

  let result;
  if (config.length > 0 && config[0].provider === 'vogent' && config[0].encryptedApiKey) {
    const apiKey = decryptApiKey(config[0].encryptedApiKey);
    result = {
      apiKey,
      baseAgentId: config[0].vogentBaseAgentId || VOGENT_BASE_AGENT_ID_ENV || '',
      phoneNumberId: config[0].vogentPhoneNumberId || VOGENT_PHONE_NUMBER_ID_ENV || '',
      defaultModelId: config[0].vogentDefaultModelId || VOGENT_DEFAULT_MODEL_ID_ENV || '',
    };
  } else {
    // Fallback to env vars
    result = {
      apiKey: VOGENT_API_KEY_ENV || '',
      baseAgentId: VOGENT_BASE_AGENT_ID_ENV || '',
      phoneNumberId: VOGENT_PHONE_NUMBER_ID_ENV || '',
      defaultModelId: VOGENT_DEFAULT_MODEL_ID_ENV || '',
    };
  }

  // Auto-fetch model ID from Vogent API if not configured
  if (!result.defaultModelId && result.apiKey) {
    if (cachedVogentModelId) {
      result.defaultModelId = cachedVogentModelId;
    } else {
      try {
        vogentService.configure(result.apiKey);
        const models = await vogentService.listModels();
        const modelList = models.data || [];
        if (modelList.length > 0) {
          cachedVogentModelId = modelList[0].id;
          result.defaultModelId = cachedVogentModelId;
          console.log(`🤖 Auto-fetched Vogent model ID: ${cachedVogentModelId} (${modelList[0].name})`);
        } else {
          console.warn('⚠️ No Vogent models found — prompt overrides may not work');
        }
      } catch (e: any) {
        console.error('⚠️ Failed to auto-fetch Vogent model ID:', e.message);
      }
    }
  }

  return result;
}

// Dasha env-var fallbacks
const DASHA_API_KEY_ENV = process.env.DASHA_API_KEY || '';
const DASHA_AGENT_ID_ENV = process.env.DASHA_AGENT_ID || '';

// Cache for auto-created Dasha agent ID
let cachedDashaAgentId: string | null = null;

// Load Dasha credentials from DB (per-org), falling back to env vars
async function getDashaConfig(organizationId: string) {
  const config = await db
    .select({
      encryptedApiKey: telephonyConfig.encryptedApiKey,
      dashaAgentId: telephonyConfig.dashaAgentId,
      provider: telephonyConfig.provider,
    })
    .from(telephonyConfig)
    .where(eq(telephonyConfig.organizationId, organizationId))
    .limit(1);

  if (config.length > 0 && config[0].provider === 'dasha' && config[0].encryptedApiKey) {
    const apiKey = decryptApiKey(config[0].encryptedApiKey);
    return {
      apiKey,
      dashaAgentId: config[0].dashaAgentId || DASHA_AGENT_ID_ENV || '',
    };
  }

  // Fallback to env vars
  return {
    apiKey: DASHA_API_KEY_ENV,
    dashaAgentId: DASHA_AGENT_ID_ENV,
  };
}

// Ensure a Dasha agent exists for the given local agent — creates one if needed
async function ensureDashaAgent(
  localAgent: any,
  dashaCfg: { apiKey: string; dashaAgentId: string },
  organizationId: string
): Promise<string> {
  // If we already have a Dasha agent ID, verify it exists
  if (dashaCfg.dashaAgentId) {
    try {
      await dashaService.getAgent(dashaCfg.dashaAgentId);
      return dashaCfg.dashaAgentId;
    } catch {
      console.log('⚠️ Stored Dasha agent ID invalid, will create new one');
    }
  }

  if (cachedDashaAgentId) {
    return cachedDashaAgentId;
  }

  // Create a new Dasha agent from the local agent config
  const webhookBaseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
  const agentConfig = dashaService.buildDashaAgentConfig(localAgent, webhookBaseUrl);

  console.log('🤖 Creating Dasha agent:', agentConfig.name);
  const dashaAgent = await dashaService.createAgent(agentConfig);
  console.log('✅ Dasha agent created:', dashaAgent.agentId);

  cachedDashaAgentId = dashaAgent.agentId;

  // Store the Dasha agent ID in the DB for future use
  try {
    await db.update(telephonyConfig)
      .set({ dashaAgentId: dashaAgent.agentId })
      .where(eq(telephonyConfig.organizationId, organizationId));
  } catch (e: any) {
    console.log('⚠️ Could not persist Dasha agent ID to DB:', e.message);
  }

  return dashaAgent.agentId;
}

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

// Proxy recording audio from Vogent (requires API auth)
// Supports ?token= query param since <audio> elements can't send Authorization headers
// Forwards Range headers for browser audio seeking support
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

    // Get Vogent API key for this org
    const vogentCfg = await getVogentConfig(organizationId);
    if (!vogentCfg.apiKey) {
      return res.status(500).json({ error: 'Vogent not configured' });
    }

    // Build upstream headers — forward Range for seeking support
    const upstreamHeaders: Record<string, string> = {
      'Authorization': `Bearer ${vogentCfg.apiKey}`,
    };
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    // Fetch the recording from Vogent with auth and stream to client
    const { default: axios } = await import('axios');
    const audioResponse = await axios.get(call.recordingUrl, {
      headers: upstreamHeaders,
      responseType: 'stream',
      // Don't reject 206 Partial Content
      validateStatus: (s: number) => s >= 200 && s < 300,
    });

    // Forward status (200 or 206)
    res.status(audioResponse.status);
    res.set({
      'Content-Type': audioResponse.headers['content-type'] || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      // Override helmet's same-origin policy so <audio> elements can load cross-origin
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (audioResponse.headers['content-length']) {
      res.set('Content-Length', audioResponse.headers['content-length']);
    }
    if (audioResponse.headers['content-range']) {
      res.set('Content-Range', audioResponse.headers['content-range']);
    }

    audioResponse.data.pipe(res);
  } catch (error: any) {
    console.error('Error proxying recording:', error?.response?.status, error.message);
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
    
    // Determine which provider to use — check Dasha first, then Vogent, then LiveKit
    let callProvider = requestedProvider || '';
    if (!callProvider) {
      const dashaCfg = await getDashaConfig(organizationId);
      if (dashaCfg.apiKey) {
        callProvider = 'dasha';
      } else {
        const vogentCfg = await getVogentConfig(organizationId);
        if (vogentCfg.apiKey && vogentCfg.baseAgentId) {
          callProvider = 'vogent';
        } else if (LIVEKIT_URL && LIVEKIT_API_KEY) {
          callProvider = 'livekit';
        } else {
          return res.status(400).json({ error: 'No telephony provider configured. Go to Settings > Telephony to set up Dasha, Vogent, or LiveKit.' });
        }
      }
    }
    
    // Get from number
    let fromNumber = '';
    if (callProvider === 'vogent') {
      fromNumber = VOGENT_PHONE_NUMBER_ENV || '';
    } else if (fromNumberId) {
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
    } else {
      const numberResult = await db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.status, 'active')))
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

    // ── Dasha provider ───────────────────────────────────
    if (callProvider === 'dasha') {
      try {
        const dashaCfg = await getDashaConfig(organizationId);
        if (!dashaCfg.apiKey) {
          throw new Error('Dasha not configured — missing API key. Go to Settings > Telephony.');
        }

        dashaService.configure(dashaCfg.apiKey);
        console.log('📞 Dasha: Scheduling call to', formattedToNumber);

        // Ensure a Dasha agent exists (creates one if needed)
        const dashaAgentId = await ensureDashaAgent(agent, dashaCfg, organizationId);

        // Build per-call additionalData for variable interpolation
        const additionalData: Record<string, string> = {};
        if (contactId) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
          if (contactResult.length > 0) {
            const c = contactResult[0];
            additionalData.first_name = c.firstName || '';
            additionalData.last_name = c.lastName || '';
            additionalData.company_name = c.company || '';
            additionalData.company = c.company || '';
            additionalData.phone = c.phone || '';
            additionalData.email = c.email || '';
          }
        }

        // Also store our internal IDs for webhook correlation
        additionalData._callId = newCall.id;
        additionalData._campaignId = (req.body.campaignId || '') as string;
        additionalData._contactId = (contactId || '') as string;

        // Schedule the call on Dasha
        const dashaCall = await dashaService.scheduleCall(
          dashaAgentId,
          formattedToNumber,
          5, // default priority
          additionalData
        );

        console.log('✅ Dasha call scheduled:', dashaCall.callId, 'status:', dashaCall.status);

        // Store the Dasha call ID on the call record
        await db.update(calls)
          .set({
            externalId: dashaCall.callId,
            status: 'ringing',
            startedAt: new Date(),
            metadata: {
              ...(newCall.metadata as object),
              dashaCallId: dashaCall.callId,
              dashaAgentId,
              campaignId: req.body.campaignId || null,
              contactId: contactId || null,
            },
          })
          .where(eq(calls.id, newCall.id));
      } catch (dashaError: any) {
        console.error('❌ Dasha error:', dashaError?.response?.data || dashaError.message);
        await db.update(calls)
          .set({
            status: 'failed',
            metadata: {
              ...(newCall.metadata as object),
              error: String(dashaError?.response?.data?.message || dashaError.message),
            },
          })
          .where(eq(calls.id, newCall.id));
      }
    }
    // ── Vogent provider ──────────────────────────────────
    else if (callProvider === 'vogent') {
      try {
        // Load credentials from DB (per-org) with env var fallback
        const vogentCfg = await getVogentConfig(organizationId);
        if (!vogentCfg.apiKey || !vogentCfg.baseAgentId || !vogentCfg.phoneNumberId) {
          throw new Error('Vogent not fully configured — missing API key, agent ID, or phone number ID. Go to Settings > Telephony.');
        }

        // Configure the service with the org's API key
        vogentService.configure(vogentCfg.apiKey);

        console.log('📞 Vogent: Initiating dial to', formattedToNumber);

        // Fetch contact data for template variable resolution (if contactId provided)
        let contactData: Record<string, string> | undefined;
        if (contactId) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
          if (contactResult.length > 0) {
            const c = contactResult[0];
            contactData = {
              first_name: c.firstName || '',
              last_name: c.lastName || '',
              company_name: c.company || '',
              company: c.company || '',
              phone: c.phone || '',
              email: c.email || '',
            };
          }
        }

        // Set up transfer function on Vogent if agent has transfer enabled
        const transferDests = (agent.transferDestinations as Array<{ name: string; phoneNumber: string; description?: string }>) || [];
        const hasTransfer = agent.transferEnabled && transferDests.length > 0 && transferDests.some(d => d.phoneNumber);

        if (hasTransfer) {
          try {
            const transferFuncId = await vogentService.ensureTransferFunction(transferDests);
            // Link the transfer function to the Vogent base agent
            await vogentService.updateAgent(vogentCfg.baseAgentId, {
              linkedFunctionDefinitionIds: [transferFuncId],
            });
            console.log('📞 Transfer function linked:', transferFuncId);
          } catch (transferErr: any) {
            console.error('⚠️ Failed to set up transfer function:', transferErr?.response?.data || transferErr.message);
            // Continue without transfer — not a fatal error
          }
        } else {
          // No transfer destinations — clear any linked functions
          try {
            await vogentService.updateAgent(vogentCfg.baseAgentId, {
              linkedFunctionDefinitionIds: [],
            });
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Build per-call agent overrides (prompt + model from our agent, voice from Vogent)
        const agentOverrides = vogentService.buildAgentOverrides({
          name: agent.name,
          systemPrompt: agent.systemPrompt,
          voiceId: agent.voiceId,
          voiceSettings: agent.voiceSettings,
          llmModel: agent.llmModel,
          llmSettings: agent.llmSettings,
          voicemailEnabled: agent.voicemailEnabled ?? false,
          voicemailMessage: agent.voicemailMessage,
          actions: agent.actions,
          transferEnabled: agent.transferEnabled ?? false,
          transferDestinations: transferDests,
        }, vogentCfg.defaultModelId, contactData);

        console.log('🔧 Vogent agentOverrides:', JSON.stringify({
          openingLine: agentOverrides?.openingLine,
          defaultVoiceId: agentOverrides?.defaultVoiceId,
          language: agentOverrides?.language,
          hasTransfer,
        }));

        const webhookUrl = process.env.VOGENT_WEBHOOK_URL; // Optional: set if publicly reachable

        const dialResult = await vogentService.createDial({
          callAgentId: vogentCfg.baseAgentId,
          toNumber: formattedToNumber,
          fromNumberId: vogentCfg.phoneNumberId,
          webhookUrl,
          agentOverrides,
        });

        console.log('✅ Vogent dial created:', dialResult);

        // Store the Vogent dial ID on the call record
        await db.update(calls)
          .set({
            externalId: dialResult.dialId,
            status: 'ringing',
            startedAt: new Date(),
            metadata: {
              ...(newCall.metadata as object),
              vogentDialId: dialResult.dialId,
              vogentSessionId: dialResult.sessionId,
            },
          })
          .where(eq(calls.id, newCall.id));
      } catch (vogentError: any) {
        console.error('❌ Vogent error:', vogentError?.response?.data || vogentError.message);
        await db.update(calls)
          .set({ status: 'failed', metadata: { ...(newCall.metadata as object), error: String(vogentError?.response?.data?.message || vogentError.message) } })
          .where(eq(calls.id, newCall.id));
      }
    }
    // ── LiveKit provider (legacy) ─────────────────────────
    else {
      try {
        console.log('🔧 LiveKit config:', {
          hasApiKey: !!LIVEKIT_API_KEY,
          hasApiSecret: !!LIVEKIT_API_SECRET,
          trunkId: LIVEKIT_SIP_TRUNK_OUTBOUND,
          url: LIVEKIT_URL,
        });
        
        if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_SIP_TRUNK_OUTBOUND) {
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
        } else {
          console.log('⚠️ LiveKit not configured - missing credentials');
        }
      } catch (livekitError) {
        console.error('❌ LiveKit error:', livekitError);
        await db.update(calls)
          .set({ status: 'failed', metadata: { ...(newCall.metadata as object), error: String(livekitError) } })
          .where(eq(calls.id, newCall.id));
      }
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
      if (call.provider === 'vogent' && call.externalId) {
        // Hang up via Vogent
        await vogentService.hangupDial(call.externalId);
        console.log('📞 Vogent dial hung up:', call.externalId);
      } else {
        // End the LiveKit room if exists
        const metadata = call.metadata as { roomName?: string } | null;
        if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET && metadata?.roomName) {
          const { roomService } = await getLiveKitApi();
          await roomService.deleteRoom(metadata.roomName);
        }
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
