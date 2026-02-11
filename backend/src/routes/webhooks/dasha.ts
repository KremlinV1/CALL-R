import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import { calls, campaigns, campaignContacts } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { dashaService, DashaCompletedPayload, DashaFailedPayload, DashaStartPayload } from '../../services/dasha.js';

const router = Router();

/**
 * Dasha BlackBox webhook handler.
 * Receives CompletedWebHookPayload, FailedWebHookPayload, and StartWebHookPayload.
 * This endpoint is public (no auth) — Dasha sends webhooks here.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const payloadType = payload?.type || payload?.status;

    console.log(`📥 Dasha webhook received: type=${payloadType}, callId=${payload?.callId}`);

    if (payloadType === 'CompletedWebHookPayload' || payloadType === 'Completed') {
      await handleCompleted(payload as DashaCompletedPayload, req);
    } else if (payloadType === 'FailedWebHookPayload' || payloadType === 'Failed') {
      await handleFailed(payload as DashaFailedPayload, req);
    } else if (payloadType === 'StartWebHookPayload' || payloadType === 'Start') {
      // StartWebHook — respond with accept and optional customPrompt
      return handleStart(payload as DashaStartPayload, req, res);
    } else {
      console.log(`⚠️ Unknown Dasha webhook type: ${payloadType}`);
    }

    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('❌ Dasha webhook error:', error.message);
    res.status(200).json({ ok: true }); // Always 200 to avoid Dasha retries
  }
});

// ── Completed Handler ─────────────────────────────────────────

async function handleCompleted(payload: DashaCompletedPayload, req: Request) {
  const dashaCallId = payload.callId;
  if (!dashaCallId) return;

  // Try to find call by our internal ID first (passed via additionalData), then by externalId
  const internalCallId = (payload.callAdditionalData as any)?._callId;
  let callResult: any[] = [];
  if (internalCallId) {
    callResult = await db.select().from(calls).where(eq(calls.id, internalCallId)).limit(1);
  }
  if (!callResult.length) {
    callResult = await db.select().from(calls).where(eq(calls.externalId, dashaCallId)).limit(1);
  }

  if (!callResult.length) {
    console.log(`⚠️ Dasha completed webhook: no matching call for ${dashaCallId}`);
    return;
  }

  const call = callResult[0];

  // Build transcript string
  const transcript = dashaService.formatTranscript(payload.transcription);

  // Determine outcome from Dasha result
  const finishReason = payload.result?.finishReason || '';
  const callOutcome = (payload.result?.postCallAnalysis as any)?.callOutcome || '';
  let outcome: string = String(callOutcome || finishReason || 'completed');

  // Update call record
  await db.update(calls)
    .set({
      status: 'completed',
      endedAt: new Date(payload.completedTime || Date.now()),
      durationSeconds: payload.durationSeconds || 0,
      outcome: outcome as string,
      transcript: transcript as string,
      recordingUrl: (payload.recordingUrl || null) as string | null,
      metadata: {
        ...(call.metadata as object || {}),
        dashaCallId,
        dashaResult: payload.result,
        dashaPostCallAnalysis: payload.result?.postCallAnalysis,
      },
    })
    .where(eq(calls.id, call.id));

  console.log(`✅ Dasha call completed: ${call.id} (${outcome}, ${payload.durationSeconds}s)`);

  // Emit socket event
  const io = req.app?.get('io');
  if (io) {
    io.to(call.organizationId).emit('call:updated', {
      callId: call.id,
      status: 'completed',
      outcome,
      durationSeconds: payload.durationSeconds,
    });
  }

  // Update campaign stats if this call belongs to a campaign
  await updateCampaignStats(call, outcome);
}

// ── Failed Handler ────────────────────────────────────────────

async function handleFailed(payload: DashaFailedPayload, req: Request) {
  const dashaCallId = payload.callId;
  if (!dashaCallId) return;

  const internalCallId = (payload as any).callAdditionalData?._callId;
  let callResult: any[] = [];
  if (internalCallId) {
    callResult = await db.select().from(calls).where(eq(calls.id, internalCallId)).limit(1);
  }
  if (!callResult.length) {
    callResult = await db.select().from(calls).where(eq(calls.externalId, dashaCallId)).limit(1);
  }

  if (!callResult.length) {
    console.log(`⚠️ Dasha failed webhook: no matching call for ${dashaCallId}`);
    return;
  }

  const call = callResult[0];
  const errorMsg = payload.errorMessage || 'Unknown error';
  const outcome = dashaService.mapFailureReason(errorMsg);

  await db.update(calls)
    .set({
      status: 'failed',
      endedAt: new Date(payload.completedTime || Date.now()),
      outcome,
      metadata: {
        ...(call.metadata as object || {}),
        dashaCallId,
        dashaError: errorMsg,
      },
    })
    .where(eq(calls.id, call.id));

  console.log(`❌ Dasha call failed: ${call.id} (${outcome}: ${errorMsg})`);

  const io = req.app?.get('io');
  if (io) {
    io.to(call.organizationId).emit('call:updated', {
      callId: call.id,
      status: 'failed',
      outcome,
      error: errorMsg,
    });
  }

  await updateCampaignStats(call, outcome);
}

// ── Start Handler ─────────────────────────────────────────────

function handleStart(payload: DashaStartPayload, req: Request, res: Response) {
  // Accept the call — optionally inject a customPrompt here
  // For now, we use the agent's default prompt configured at creation time
  // and pass per-call variables via additionalData when scheduling
  console.log(`📞 Dasha call starting: ${payload.callId}`);
  return res.status(200).json({ accept: true });
}

// ── Campaign Stats ────────────────────────────────────────────

async function updateCampaignStats(call: any, outcome: string) {
  const meta = (call.metadata || {}) as Record<string, any>;
  const campaignId = meta.campaignId || call.campaignId;
  const contactId = meta.contactId || call.contactId;

  if (!campaignId) return;

  try {
    let contactStatus: string;
    let counterIncrement: Record<string, any> = {
      completedCalls: sql`${campaigns.completedCalls} + 1`,
    };

    if (outcome === 'voicemail') {
      contactStatus = 'voicemail';
      counterIncrement.voicemailCalls = sql`${campaigns.voicemailCalls} + 1`;
    } else if (outcome === 'failed' || outcome === 'busy' || outcome === 'no_answer') {
      contactStatus = 'failed';
      counterIncrement.failedCalls = sql`${campaigns.failedCalls} + 1`;
    } else {
      contactStatus = 'completed';
      counterIncrement.connectedCalls = sql`${campaigns.connectedCalls} + 1`;
    }

    if (contactId) {
      await db.update(campaignContacts)
        .set({
          status: contactStatus,
          completedAt: new Date(),
          result: outcome,
        })
        .where(and(
          eq(campaignContacts.campaignId, campaignId),
          eq(campaignContacts.contactId, contactId)
        ));
    }

    await db.update(campaigns)
      .set(counterIncrement)
      .where(eq(campaigns.id, campaignId));

    console.log(`📊 Campaign ${campaignId} updated: ${contactStatus}`);
  } catch (err: any) {
    console.error(`⚠️ Failed to update campaign stats:`, err.message);
  }
}

export default router;
