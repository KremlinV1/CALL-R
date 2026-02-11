import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { calls, telephonyConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { vogentService } from '../services/vogent.js';
import { decryptApiKey } from '../utils/crypto.js';

const router = Router();

// ── Webhook: Vogent dial status updates ──────────────────
// This endpoint is called by Vogent when a dial status changes.
// It's a PUBLIC endpoint (no auth middleware) — Vogent calls it directly.
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    console.log('📞 Vogent webhook received:', JSON.stringify(event).slice(0, 500));

    const dialId = event.dialId || event.id;
    if (!dialId) {
      return res.status(200).json({ ok: true }); // Ack even if no dialId
    }

    // Find the call by vogent dial ID stored in metadata
    const callResults = await db
      .select()
      .from(calls)
      .where(eq(calls.externalId, dialId))
      .limit(1);

    if (callResults.length === 0) {
      console.log(`⚠️ No call found for Vogent dial ${dialId}`);
      return res.status(200).json({ ok: true });
    }

    const call = callResults[0];
    const vogentStatus = event.status;
    const mappedStatus = vogentService.mapDialStatus(vogentStatus);

    console.log(`📞 Dial ${dialId} status: ${vogentStatus} → ${mappedStatus}`);

    // Build update payload
    const updateData: Record<string, any> = {
      status: mappedStatus,
      updatedAt: new Date(),
    };

    // Handle specific status transitions
    if (vogentStatus === 'ringing') {
      updateData.startedAt = new Date();
    } else if (vogentStatus === 'in-progress') {
      updateData.answeredAt = new Date();
    } else if (['completed', 'failed', 'canceled', 'busy', 'no-answer'].includes(vogentStatus)) {
      updateData.endedAt = new Date();

      // Configure vogentService with per-org API key
      try {
        const orgConfig = await db
          .select({ encryptedApiKey: telephonyConfig.encryptedApiKey, provider: telephonyConfig.provider })
          .from(telephonyConfig)
          .where(eq(telephonyConfig.organizationId, call.organizationId))
          .limit(1);
        if (orgConfig.length > 0 && orgConfig[0].provider === 'vogent' && orgConfig[0].encryptedApiKey) {
          vogentService.configure(decryptApiKey(orgConfig[0].encryptedApiKey));
        }
      } catch (e) {
        // Fall through — use default env var key
      }

      // Fetch full dial details for transcript/recording
      try {
        const dialDetails = await vogentService.getDial(dialId);

        console.log(`🎙️ Dial ${dialId} details:`, JSON.stringify({
          status: dialDetails.status,
          durationSeconds: dialDetails.durationSeconds,
          recordings: dialDetails.recordings,
          hasTranscript: !!(dialDetails.transcript?.length),
          systemResultType: dialDetails.systemResultType,
          voiceId: dialDetails.voiceId,
        }, null, 2));

        if (dialDetails.durationSeconds) {
          updateData.durationSeconds = dialDetails.durationSeconds;
        }

        if (dialDetails.transcript && dialDetails.transcript.length > 0) {
          updateData.transcript = vogentService.formatTranscript(dialDetails.transcript);
        }

        if (dialDetails.recordings && dialDetails.recordings.length > 0) {
          updateData.recordingUrl = dialDetails.recordings[0].url;
        }

        if (dialDetails.systemResultType) {
          updateData.outcome = vogentService.mapSystemResult(dialDetails.systemResultType);

          // If Vogent detected voicemail, override status to 'voicemail'
          if (dialDetails.systemResultType === 'VOICEMAIL_DETECTED_HANGUP') {
            updateData.status = 'voicemail';
            updateData.outcome = 'Voicemail - Message Left';
          }
        }

        // Also detect voicemail from transcript (when agent left a VM via prompt instructions)
        if (dialDetails.transcript && dialDetails.transcript.length > 0) {
          const transcriptText = dialDetails.transcript.map(t => t.text).join(' ').toLowerCase();
          const vmIndicators = ['leave a message', 'after the tone', 'after the beep', 'voicemail', 'not available'];
          const isLikelyVoicemail = vmIndicators.some(indicator => transcriptText.includes(indicator));
          if (isLikelyVoicemail && updateData.status !== 'voicemail') {
            updateData.status = 'voicemail';
            if (!updateData.outcome || updateData.outcome === 'Agent Hangup') {
              updateData.outcome = 'Voicemail - Message Left';
            }
          }
        }

        if (dialDetails.aiResult) {
          updateData.extractedData = dialDetails.aiResult;
        }
      } catch (fetchErr) {
        console.error(`❌ Failed to fetch dial details for ${dialId}:`, fetchErr);
      }
    }

    // Update the call record
    await db.update(calls)
      .set(updateData)
      .where(eq(calls.id, call.id));

    // Emit socket event
    const io = req.app.get('io');
    if (io && call.organizationId) {
      io.to(call.organizationId).emit('call:updated', {
        callId: call.id,
        status: mappedStatus,
        durationSeconds: updateData.durationSeconds,
        outcome: updateData.outcome,
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Vogent webhook error:', error);
    res.status(200).json({ ok: true }); // Always ack to prevent retries
  }
});

// ── Poll dial status (for calls without webhook) ─────────
router.post('/sync/:callId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const callResult = await db
      .select()
      .from(calls)
      .where(eq(calls.id, req.params.callId))
      .limit(1);

    if (callResult.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = callResult[0];
    if (!call.externalId) {
      return res.status(400).json({ error: 'No Vogent dial associated with this call' });
    }

    const dialDetails = await vogentService.getDial(call.externalId);

    const updateData: Record<string, any> = {
      status: vogentService.mapDialStatus(dialDetails.status),
      updatedAt: new Date(),
    };

    if (dialDetails.durationSeconds) {
      updateData.durationSeconds = dialDetails.durationSeconds;
    }
    if (dialDetails.transcript && dialDetails.transcript.length > 0) {
      updateData.transcript = vogentService.formatTranscript(dialDetails.transcript);
    }
    if (dialDetails.recordings && dialDetails.recordings.length > 0) {
      updateData.recordingUrl = dialDetails.recordings[0].url;
    }
    if (dialDetails.systemResultType) {
      updateData.outcome = vogentService.mapSystemResult(dialDetails.systemResultType);
    }
    if (dialDetails.aiResult) {
      updateData.extractedData = dialDetails.aiResult;
    }
    if (dialDetails.startedAt) {
      updateData.startedAt = new Date(dialDetails.startedAt);
    }
    if (dialDetails.endedAt) {
      updateData.endedAt = new Date(dialDetails.endedAt);
    }

    const [updatedCall] = await db.update(calls)
      .set(updateData)
      .where(eq(calls.id, call.id))
      .returning();

    res.json({ call: updatedCall, vogentDial: dialDetails });
  } catch (error) {
    console.error('Error syncing Vogent dial:', error);
    res.status(500).json({ error: 'Failed to sync dial status' });
  }
});

// ── List Vogent phone numbers ────────────────────────────
router.get('/phone-numbers', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!vogentService.isConfigured()) {
      return res.status(400).json({ error: 'Vogent not configured' });
    }

    const organizationId = req.user?.organizationId;

    // Get the primary phone number ID from telephony config (DB first, then env fallback)
    let primaryNumberId: string | null = null;
    if (organizationId) {
      try {
        const config = await db
          .select({ vogentPhoneNumberId: telephonyConfig.vogentPhoneNumberId })
          .from(telephonyConfig)
          .where(eq(telephonyConfig.organizationId, organizationId))
          .limit(1);
        primaryNumberId = config[0]?.vogentPhoneNumberId || null;
      } catch (e) {
        // DB lookup failed (e.g. invalid UUID) — fall through to env var
      }
    }
    if (!primaryNumberId) {
      primaryNumberId = process.env.VOGENT_PHONE_NUMBER_ID || null;
    }

    const result = await vogentService.listPhoneNumbers();
    console.log('📞 Phone numbers - orgId:', organizationId, 'primaryNumberId:', primaryNumberId, 'env:', process.env.VOGENT_PHONE_NUMBER_ID);
    res.json({ phoneNumbers: result.data, primaryNumberId });
  } catch (error) {
    console.error('Error listing Vogent phone numbers:', error);
    res.status(500).json({ error: 'Failed to list phone numbers' });
  }
});

// ── List Vogent models ───────────────────────────────────
router.get('/models', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!vogentService.isConfigured()) {
      return res.status(400).json({ error: 'Vogent not configured' });
    }
    const result = await vogentService.listModels();
    res.json({ models: result.data });
  } catch (error) {
    console.error('Error listing Vogent models:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// ── List Vogent voices ───────────────────────────────────
router.get('/voices', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!vogentService.isConfigured()) {
      return res.status(400).json({ error: 'Vogent not configured' });
    }
    const result = await (vogentService as any).client.get('/voices?limit=50');
    res.json({ voices: result.data.voices || [] });
  } catch (error) {
    console.error('Error listing Vogent voices:', error);
    res.status(500).json({ error: 'Failed to list voices' });
  }
});

export default router;
