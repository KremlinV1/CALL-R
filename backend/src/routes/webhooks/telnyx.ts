import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import { calls, agents, campaigns, campaignContacts, messages, contacts, phoneNumbers } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { TelnyxService } from '../../services/telnyx.js';
import { analyzeCall } from '../../services/callAnalysis.js';
import { usageService } from '../../services/usageService.js';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';

// Import io getter for real-time events
function getIO(req?: Request) {
  // Webhook routes don't have req.app, so use the global import
  return (globalThis as any).__socketIO;
}

const router = Router();

// Telnyx webhook event types
type TelnyxEventType =
  | 'call.initiated'
  | 'call.answered'
  | 'call.hangup'
  | 'call.machine.detection.ended'
  | 'call.machine.greeting.ended'
  | 'call.machine.premium.detection.ended'
  | 'call.machine.premium.greeting.ended'
  | 'call.playback.started'
  | 'call.playback.ended'
  | 'call.recording.saved'
  | 'call.speak.started'
  | 'call.speak.ended'
  | 'call.dtmf.received'
  | 'call.gather.ended'
  | 'call.bridged'
  | 'call.refer.started'
  | 'call.refer.completed'
  | 'call.refer.failed';

interface TelnyxWebhookPayload {
  data: {
    event_type: TelnyxEventType;
    id: string;
    occurred_at: string;
    payload: {
      call_control_id: string;
      call_leg_id: string;
      call_session_id: string;
      client_state?: string;
      connection_id: string;
      from: string;
      to: string;
      direction: 'incoming' | 'outgoing';
      state?: string;
      hangup_cause?: string;
      hangup_source?: string;
      sip_hangup_cause?: string;
      recording_urls?: {
        mp3?: string;
        wav?: string;
      };
      digit?: string;
      digits?: string;
      result?: string;
      [key: string]: any;
    };
    record_type: string;
  };
  meta: {
    attempt: number;
    delivered_to: string;
  };
}

// POST /api/webhooks/telnyx - Main webhook endpoint
router.post('/', async (req: Request, res: Response) => {
  try {
    const event = req.body as TelnyxWebhookPayload;
    const eventType = event.data.event_type;
    const payload = event.data.payload;

    console.log(`[Telnyx Webhook] Event: ${eventType}`, {
      callControlId: payload.call_control_id,
      from: payload.from,
      to: payload.to,
      direction: payload.direction,
    });

    // Parse client state if present
    let clientState: Record<string, any> = {};
    if (payload.client_state) {
      try {
        const decoded = TelnyxService.parseClientState(payload.client_state);
        clientState = JSON.parse(decoded);
      } catch {
        clientState = {};
      }
    }

    // Find call by Telnyx call control ID (stored in externalId)
    const existingCall = await db
      .select()
      .from(calls)
      .where(eq(calls.externalId, payload.call_control_id))
      .limit(1);

    const call = existingCall[0];

    switch (eventType) {
      case 'call.initiated':
        // Call has been initiated
        if (call) {
          await db
            .update(calls)
            .set({
              status: 'ringing',
              externalId: payload.call_control_id,
            })
            .where(eq(calls.id, call.id));
          
          const io1 = getIO();
          io1?.to(call.organizationId).emit('call:status', {
            callId: call.id, status: 'ringing', fromNumber: payload.from, toNumber: payload.to,
          });
        }
        break;

      case 'call.answered':
        // Call was answered
        if (call) {
          await db
            .update(calls)
            .set({
              status: 'in_progress',
              answeredAt: new Date(),
            })
            .where(eq(calls.id, call.id));

          // Update campaign contact if applicable
          if (clientState.campaignContactId) {
            await db
              .update(campaignContacts)
              .set({
                status: 'in_progress',
                lastAttemptAt: new Date(),
              })
              .where(eq(campaignContacts.id, clientState.campaignContactId));
          }
          
          const io2 = getIO();
          io2?.to(call.organizationId).emit('call:status', {
            callId: call.id, status: 'in_progress', answeredAt: new Date().toISOString(),
          });
        }

        // Handle warm transfer: target answered — bridge the calls
        if (clientState.transferType === 'warm' && clientState.originalCallControlId) {
          const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
          if (TELNYX_API_KEY) {
            try {
              const telnyx = new TelnyxService(TELNYX_API_KEY);

              // Optionally speak a whisper message to the target before bridging
              if (clientState.whisperMessage) {
                console.log(`[Telnyx Webhook] Playing whisper to transfer target: "${clientState.whisperMessage}"`);
                await telnyx.speak({
                  callControlId: payload.call_control_id,
                  payload: clientState.whisperMessage,
                  voice: 'female',
                  language: 'en-US',
                });
                // Wait a moment for whisper to play, then bridge
                await new Promise(r => setTimeout(r, 3000));
              }

              // Bridge original caller with the transfer target
              await telnyx.bridgeCalls(
                clientState.originalCallControlId,
                payload.call_control_id
              );

              console.log(`[Telnyx Webhook] Warm transfer bridged: ${clientState.originalCallControlId} ↔ ${payload.call_control_id}`);

              // Update the original call metadata
              if (clientState.callId) {
                await db
                  .update(calls)
                  .set({
                    metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{transfer,status}', '"bridged"')`,
                    updatedAt: new Date(),
                  })
                  .where(eq(calls.id, clientState.callId));
              }
            } catch (bridgeErr: any) {
              console.error('[Telnyx Webhook] Warm transfer bridge failed:', bridgeErr.message);
            }
          }
        }
        break;

      case 'call.hangup':
        // Call ended
        if (call) {
          const endTime = new Date();
          const duration = call.startedAt
            ? Math.floor((endTime.getTime() - new Date(call.startedAt).getTime()) / 1000)
            : 0;

          // Map Telnyx hangup causes to our status
          let finalStatus: 'completed' | 'failed' | 'busy' | 'no_answer' = 'completed';
          const hangupCause = payload.hangup_cause || '';
          
          if (hangupCause.includes('busy') || hangupCause === 'USER_BUSY') {
            finalStatus = 'busy';
          } else if (hangupCause.includes('no_answer') || hangupCause === 'NO_ANSWER' || hangupCause === 'NO_USER_RESPONSE') {
            finalStatus = 'no_answer';
          } else if (hangupCause.includes('failed') || hangupCause.includes('error') || hangupCause === 'CALL_REJECTED') {
            finalStatus = 'failed';
          }

          await db
            .update(calls)
            .set({
              status: finalStatus,
              endedAt: endTime,
              durationSeconds: duration,
            })
            .where(eq(calls.id, call.id));

          const io3 = getIO();
          io3?.to(call.organizationId).emit('call:status', {
            callId: call.id, status: finalStatus, endedAt: endTime.toISOString(), durationSeconds: duration,
          });

          // ─── Record usage minutes ────────────────────────────────
          if (duration > 0) {
            usageService.recordUsage(call.organizationId, call.id, duration, {
              campaignId: call.campaignId || undefined,
              description: `${call.direction} call to ${payload.to || 'unknown'}`,
            }).catch(err => console.error(`[Webhook] Usage recording failed for call ${call.id}:`, err.message));
          }
          // ─── End usage recording ─────────────────────────────────

          // Update campaign contact if applicable
          if (clientState.campaignContactId) {
            await db
              .update(campaignContacts)
              .set({
                status: finalStatus === 'completed' ? 'completed' : 'failed',
              })
              .where(eq(campaignContacts.id, clientState.campaignContactId));
          }

          // Auto-analyze call if it completed and has a transcript
          if (finalStatus === 'completed' && process.env.OPENAI_API_KEY) {
            analyzeCall(call.id).catch(err =>
              console.error(`[Webhook] Auto-analysis failed for call ${call.id}:`, err.message)
            );
          }
        }
        break;

      case 'call.recording.saved':
        // Recording is available
        if (call && payload.recording_urls) {
          const recordingUrl = payload.recording_urls.mp3 || payload.recording_urls.wav;
          if (recordingUrl) {
            await db
              .update(calls)
              .set({
                recordingUrl,
                updatedAt: new Date(),
              })
              .where(eq(calls.id, call.id));
          }
        }
        break;

      case 'call.machine.detection.ended':
      case 'call.machine.premium.detection.ended': {
        // Answering machine detection result
        const amdResult = payload.result || 'not_sure';
        const isHuman = ['human', 'human_residence', 'human_business'].includes(amdResult);
        const isMachine = amdResult === 'machine';

        console.log(`[Telnyx] AMD result for call ${call?.id || 'unknown'}: ${amdResult} (isHuman: ${isHuman}, isMachine: ${isMachine})`);

        if (call) {
          // Store AMD result in metadata
          await db
            .update(calls)
            .set({
              metadata: {
                ...(call.metadata as object || {}),
                amd: {
                  result: amdResult,
                  isHuman,
                  isMachine,
                  detectedAt: new Date().toISOString(),
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(calls.id, call.id));

          // If machine detected, decide based on voicemail config
          if (isMachine) {
            const vmConfig = clientState.voicemail;

            if (vmConfig?.enabled && vmConfig?.action === 'leave_message') {
              // Will wait for greeting.ended (beep) before dropping message
              console.log(`[Telnyx] Machine detected on call ${call.id} — waiting for beep to drop voicemail`);
            } else if (vmConfig?.enabled && vmConfig?.action === 'hangup') {
              // Hang up immediately on machine
              console.log(`[Telnyx] Machine detected on call ${call.id} — hanging up per config`);
              if (TELNYX_API_KEY) {
                const telnyx = new TelnyxService(TELNYX_API_KEY);
                await telnyx.hangupCall(payload.call_control_id).catch(() => {});
              }
              await db.update(calls)
                .set({ status: 'voicemail', updatedAt: new Date() })
                .where(eq(calls.id, call.id));
            } else {
              // Default: mark as voicemail, no action
              console.log(`[Telnyx] Machine detected on call ${call.id} — voicemail disabled, marking status`);
              await db.update(calls)
                .set({ status: 'voicemail', updatedAt: new Date() })
                .where(eq(calls.id, call.id));
            }
          }
        }
        break;
      }

      case 'call.machine.greeting.ended':
      case 'call.machine.premium.greeting.ended': {
        // Greeting ended — beep detected or timeout. This is when we drop the voicemail message.
        const greetingResult = payload.result || '';
        const beepDetected = ['beep_detected', 'ended'].includes(greetingResult);

        console.log(`[Telnyx] Greeting ended for call ${call?.id || 'unknown'}: result=${greetingResult}, beep=${beepDetected}`);

        if (call && beepDetected) {
          const vmConfig = clientState.voicemail;

          if (vmConfig?.enabled && vmConfig?.action === 'leave_message') {
            // Drop the voicemail message
            let voicemailText = vmConfig.message;

            // If no static message, generate a default
            if (!voicemailText) {
              voicemailText = 'Hello, this is a call from our office. We were trying to reach you regarding an important matter. Please call us back at your earliest convenience. Thank you.';
            }

            // If agent has a custom message, try to look it up
            if (!vmConfig.message && clientState.agentId) {
              try {
                const [agent] = await db
                  .select({ voicemailMessage: agents.voicemailMessage, name: agents.name })
                  .from(agents)
                  .where(eq(agents.id, clientState.agentId))
                  .limit(1);
                if (agent?.voicemailMessage) {
                  voicemailText = agent.voicemailMessage;
                } else if (agent?.name) {
                  voicemailText = `Hello, this is ${agent.name}. We were trying to reach you. Please call us back at your earliest convenience. Thank you and have a great day.`;
                }
              } catch {}
            }

            console.log(`[Telnyx] Dropping voicemail on call ${call.id}: "${voicemailText.substring(0, 80)}..."`);

            if (TELNYX_API_KEY) {
              try {
                const telnyx = new TelnyxService(TELNYX_API_KEY);
                await telnyx.speak({
                  callControlId: payload.call_control_id,
                  payload: voicemailText,
                  voice: 'female',
                  language: 'en-US',
                  clientState: JSON.stringify({
                    ...clientState,
                    voicemailDropped: true,
                  }),
                });

                // Update call status and metadata
                await db.update(calls)
                  .set({
                    status: 'voicemail',
                    metadata: {
                      ...(call.metadata as object || {}),
                      amd: {
                        ...((call.metadata as any)?.amd || {}),
                        voicemailDropped: true,
                        voicemailMessage: voicemailText,
                        droppedAt: new Date().toISOString(),
                      },
                    },
                    updatedAt: new Date(),
                  })
                  .where(eq(calls.id, call.id));

                console.log(`[Telnyx] ✅ Voicemail message dropped on call ${call.id}`);
              } catch (speakErr: any) {
                console.error(`[Telnyx] ❌ Failed to drop voicemail on call ${call.id}:`, speakErr.message);
              }
            }
          }
        }
        break;
      }

      case 'call.dtmf.received':
        // DTMF digit received
        console.log(`[Telnyx] DTMF received: ${payload.digit} for call ${payload.call_control_id}`);
        // Handle DTMF for IVR if needed
        break;

      case 'call.gather.ended':
        // DTMF gather completed
        console.log(`[Telnyx] Gather ended with digits: ${payload.digits} for call ${payload.call_control_id}`);
        // Handle gathered digits for IVR
        break;

      case 'call.speak.ended':
      case 'call.playback.ended':
        // TTS or audio playback finished
        console.log(`[Telnyx] ${eventType} for call ${payload.call_control_id}`);

        // If voicemail was just dropped, hang up the call
        if (clientState.voicemailDropped && TELNYX_API_KEY) {
          console.log(`[Telnyx] Voicemail playback finished — hanging up call ${call?.id || payload.call_control_id}`);
          try {
            const telnyx = new TelnyxService(TELNYX_API_KEY);
            await telnyx.hangupCall(payload.call_control_id);
          } catch (hangupErr: any) {
            console.error(`[Telnyx] Failed to hangup after voicemail:`, hangupErr.message);
          }
        }
        break;

      default:
        console.log(`[Telnyx] Unhandled event type: ${eventType}`);
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Telnyx Webhook] Error processing webhook:', error);
    // Still return 200 to prevent retries for processing errors
    res.status(200).json({ received: true, error: 'Processing error' });
  }
});

// ─── SMS / Messaging Webhook ──────────────────────────────────────
router.post('/messaging', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(200).json({ received: true });

    const eventType = data.event_type;
    const payload = data.payload;

    console.log(`[Telnyx SMS] Event: ${eventType}`);

    if (eventType === 'message.received') {
      const fromNumber = payload.from?.phone_number || '';
      const toNumber = payload.to?.[0]?.phone_number || '';
      const body = payload.text || '';
      const externalId = payload.id || '';
      const mediaUrls = (payload.media || []).map((m: any) => m.url);

      // Look up which org owns this number
      const [ownedNumber] = await db
        .select({ organizationId: phoneNumbers.organizationId })
        .from(phoneNumbers)
        .where(eq(phoneNumbers.number, toNumber))
        .limit(1);

      if (!ownedNumber) {
        console.log(`[Telnyx SMS] No org found for number ${toNumber}`);
        return res.status(200).json({ received: true });
      }

      const organizationId = ownedNumber.organizationId;

      // Try to match sender to a contact
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.organizationId, organizationId), eq(contacts.phone, fromNumber)))
        .limit(1);

      // Store the inbound message
      await db.insert(messages).values({
        organizationId,
        contactId: contact?.id || null,
        direction: 'inbound',
        status: 'received',
        fromNumber,
        toNumber,
        body,
        provider: 'telnyx',
        externalId,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
      });

      // Emit socket event
      const io = getIO();
      io?.to(organizationId).emit('message:received', { fromNumber, toNumber, body });

      console.log(`[Telnyx SMS] Inbound message stored from ${fromNumber}`);
    } else if (eventType === 'message.sent' || eventType === 'message.delivered' || eventType === 'message.failed') {
      // Update outbound message status
      const externalId = payload.id;
      const newStatus = eventType === 'message.delivered' ? 'delivered'
        : eventType === 'message.failed' ? 'failed' : 'sent';

      if (externalId) {
        const updateData: any = { status: newStatus };
        if (newStatus === 'delivered') updateData.deliveredAt = new Date();
        if (newStatus === 'failed') {
          updateData.errorCode = payload.errors?.[0]?.code;
          updateData.errorMessage = payload.errors?.[0]?.title;
        }

        await db.update(messages)
          .set(updateData)
          .where(eq(messages.externalId, externalId));
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Telnyx SMS Webhook] Error:', error);
    res.status(200).json({ received: true });
  }
});

export default router;
