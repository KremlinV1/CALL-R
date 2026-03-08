import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { calls } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createTelnyxService } from '../services/telnyx.js';

const router = Router();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || '';
const API_URL = process.env.API_URL || 'http://localhost:4000';

/**
 * POST /api/transfers/cold
 * Cold transfer: directly transfers the active call to a target number.
 * The original caller hears ringing, then connects to the target.
 * The AI agent leg is dropped.
 */
router.post('/cold', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { callId, targetNumber, whisperText } = req.body;

    if (!callId) return res.status(400).json({ error: 'callId is required' });
    if (!targetNumber) return res.status(400).json({ error: 'targetNumber is required' });

    if (!TELNYX_API_KEY) {
      return res.status(400).json({ error: 'Telnyx API key not configured' });
    }

    // Verify call belongs to org and is active
    const [call] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
      .limit(1);

    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.externalId) return res.status(400).json({ error: 'Call has no active Telnyx session' });
    if (!['in_progress', 'ringing'].includes(call.status)) {
      return res.status(400).json({ error: `Call is not active (status: ${call.status})` });
    }

    const telnyx = createTelnyxService(TELNYX_API_KEY);

    // Build client state for tracking
    const clientState = JSON.stringify({
      callId: call.id,
      organizationId,
      transferType: 'cold',
      targetNumber,
    });

    // Transfer the call directly
    await telnyx.transferCall({
      callControlId: call.externalId,
      to: targetNumber,
      from: call.fromNumber,
      clientState,
      webhookUrl: `${API_URL}/api/webhooks/telnyx`,
      timeout: 30,
    });

    // Update call metadata
    await db
      .update(calls)
      .set({
        metadata: {
          ...(call.metadata as object || {}),
          transfer: {
            type: 'cold',
            targetNumber,
            initiatedAt: new Date().toISOString(),
            status: 'transferring',
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    // Emit socket event
    const io = req.app.get('io');
    io?.to(organizationId).emit('call:transferring', {
      callId,
      transferType: 'cold',
      targetNumber,
    });

    console.log(`[Transfer] Cold transfer initiated: call ${callId} → ${targetNumber}`);
    res.json({ success: true, transferType: 'cold', targetNumber });
  } catch (error: any) {
    const errDetails = error?.response?.data || error?.message || error;
    console.error('[Transfer] Cold transfer error:', JSON.stringify(errDetails, null, 2));
    res.status(500).json({ error: 'Failed to initiate cold transfer' });
  }
});

/**
 * POST /api/transfers/warm
 * Warm transfer: creates a new outbound call to the target, lets the agent
 * speak with the target first (whisper), then bridges the original caller in.
 *
 * Flow:
 * 1. AI agent speaks whisper message to target (optional)
 * 2. New call placed to target number
 * 3. When target answers, the two calls are bridged together
 */
router.post('/warm', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { callId, targetNumber, whisperMessage } = req.body;

    if (!callId) return res.status(400).json({ error: 'callId is required' });
    if (!targetNumber) return res.status(400).json({ error: 'targetNumber is required' });

    if (!TELNYX_API_KEY || !TELNYX_CONNECTION_ID) {
      return res.status(400).json({ error: 'Telnyx configuration incomplete' });
    }

    // Verify call belongs to org and is active
    const [call] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
      .limit(1);

    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.externalId) return res.status(400).json({ error: 'Call has no active Telnyx session' });
    if (call.status !== 'in_progress') {
      return res.status(400).json({ error: `Call is not in progress (status: ${call.status})` });
    }

    const telnyx = createTelnyxService(TELNYX_API_KEY);

    // Step 1: Place a new outbound call to the target
    const clientState = JSON.stringify({
      callId: call.id,
      organizationId,
      transferType: 'warm',
      originalCallControlId: call.externalId,
      targetNumber,
      whisperMessage: whisperMessage || null,
    });

    const newCall = await telnyx.createCall({
      to: targetNumber,
      from: call.fromNumber,
      connectionId: TELNYX_CONNECTION_ID,
      clientState,
      webhookUrl: `${API_URL}/api/webhooks/telnyx`,
      timeout: 30,
    });

    // Update call metadata with warm transfer info
    await db
      .update(calls)
      .set({
        metadata: {
          ...(call.metadata as object || {}),
          transfer: {
            type: 'warm',
            targetNumber,
            targetCallControlId: newCall.call_control_id,
            whisperMessage: whisperMessage || null,
            initiatedAt: new Date().toISOString(),
            status: 'calling_target',
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    // Emit socket event
    const io = req.app.get('io');
    io?.to(organizationId).emit('call:transferring', {
      callId,
      transferType: 'warm',
      targetNumber,
      status: 'calling_target',
    });

    console.log(`[Transfer] Warm transfer initiated: call ${callId} → ${targetNumber} (target call: ${newCall.call_control_id})`);
    res.json({
      success: true,
      transferType: 'warm',
      targetNumber,
      targetCallControlId: newCall.call_control_id,
    });
  } catch (error: any) {
    const errDetails = error?.response?.data || error?.message || error;
    console.error('[Transfer] Warm transfer error:', JSON.stringify(errDetails, null, 2));
    res.status(500).json({ error: 'Failed to initiate warm transfer' });
  }
});

/**
 * POST /api/transfers/bridge
 * Manually bridge two active calls together (used after warm transfer target answers).
 * This is also called automatically via webhook when the target answers.
 */
router.post('/bridge', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { callId, targetCallControlId } = req.body;

    if (!callId) return res.status(400).json({ error: 'callId is required' });
    if (!targetCallControlId) return res.status(400).json({ error: 'targetCallControlId is required' });

    if (!TELNYX_API_KEY) {
      return res.status(400).json({ error: 'Telnyx API key not configured' });
    }

    // Verify call belongs to org
    const [call] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
      .limit(1);

    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.externalId) return res.status(400).json({ error: 'Call has no active Telnyx session' });

    const telnyx = createTelnyxService(TELNYX_API_KEY);

    // Bridge the original call with the target call
    await telnyx.bridgeCalls(call.externalId, targetCallControlId);

    // Update metadata
    await db
      .update(calls)
      .set({
        metadata: {
          ...(call.metadata as object || {}),
          transfer: {
            ...((call.metadata as any)?.transfer || {}),
            status: 'bridged',
            bridgedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    // Emit socket event
    const io = req.app.get('io');
    io?.to(organizationId).emit('call:transferred', {
      callId,
      targetCallControlId,
      status: 'bridged',
    });

    console.log(`[Transfer] Calls bridged: ${call.externalId} ↔ ${targetCallControlId}`);
    res.json({ success: true, status: 'bridged' });
  } catch (error: any) {
    const errDetails = error?.response?.data || error?.message || error;
    console.error('[Transfer] Bridge error:', JSON.stringify(errDetails, null, 2));
    res.status(500).json({ error: 'Failed to bridge calls' });
  }
});

/**
 * POST /api/transfers/cancel
 * Cancel a pending warm transfer by hanging up the target call.
 */
router.post('/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) return res.status(401).json({ error: 'Unauthorized' });

    const { callId } = req.body;

    if (!callId) return res.status(400).json({ error: 'callId is required' });
    if (!TELNYX_API_KEY) return res.status(400).json({ error: 'Telnyx API key not configured' });

    const [call] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, callId), eq(calls.organizationId, organizationId)))
      .limit(1);

    if (!call) return res.status(404).json({ error: 'Call not found' });

    const transfer = (call.metadata as any)?.transfer;
    if (!transfer?.targetCallControlId) {
      return res.status(400).json({ error: 'No active warm transfer to cancel' });
    }

    const telnyx = createTelnyxService(TELNYX_API_KEY);

    // Hang up the target call
    try {
      await telnyx.hangupCall(transfer.targetCallControlId);
    } catch (e: any) {
      console.warn('[Transfer] Could not hang up target call (may already be ended):', e.message);
    }

    // Update metadata
    await db
      .update(calls)
      .set({
        metadata: {
          ...(call.metadata as object || {}),
          transfer: {
            ...transfer,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callId));

    const io = req.app.get('io');
    io?.to(organizationId).emit('call:transfer-cancelled', { callId });

    console.log(`[Transfer] Warm transfer cancelled for call ${callId}`);
    res.json({ success: true, status: 'cancelled' });
  } catch (error: any) {
    console.error('[Transfer] Cancel error:', error.message);
    res.status(500).json({ error: 'Failed to cancel transfer' });
  }
});

export default router;
