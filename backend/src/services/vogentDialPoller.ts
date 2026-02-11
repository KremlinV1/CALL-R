import { db } from '../db/index.js';
import { calls, telephonyConfig, campaignContacts, campaigns } from '../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { vogentService } from './vogent.js';
import { decryptApiKey } from '../utils/crypto.js';

const POLL_INTERVAL_MS = 10_000; // Poll every 10 seconds
type CallStatus = 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'voicemail' | 'busy' | 'no_answer';
const ACTIVE_STATUSES: CallStatus[] = ['queued', 'ringing', 'in_progress'];

class VogentDialPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private io: any = null;

  start(io?: any) {
    if (!vogentService.isConfigured()) {
      console.log('⚠️ Vogent not configured — dial poller disabled');
      return;
    }

    this.io = io;
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    console.log(`🔄 Vogent Dial Poller started (every ${POLL_INTERVAL_MS / 1000}s)`);

    // Run an immediate sync on startup to catch any stale calls
    setTimeout(() => this.poll(), 2000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🔄 Vogent Dial Poller stopped');
    }
  }

  private async poll() {
    if (this.isPolling) return; // Skip if previous poll still running
    this.isPolling = true;

    try {
      // Find all Vogent calls that are still active (queued, ringing, in_progress)
      const activeCalls = await db
        .select()
        .from(calls)
        .where(
          and(
            eq(calls.provider, 'vogent'),
            inArray(calls.status, ACTIVE_STATUSES)
          )
        );

      if (activeCalls.length === 0) {
        this.isPolling = false;
        return;
      }

      console.log(`🔄 Polling ${activeCalls.length} active Vogent call(s)...`);

      for (const call of activeCalls) {
        if (!call.externalId) continue;

        try {
          await this.syncDial(call);
        } catch (err: any) {
          console.error(`❌ Failed to sync dial ${call.externalId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ Vogent poller error:', err);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Resolve the Vogent API key for a given organization.
   * Checks DB first, falls back to env var.
   */
  private async getOrgApiKey(organizationId: string): Promise<string> {
    try {
      const config = await db
        .select({
          encryptedApiKey: telephonyConfig.encryptedApiKey,
          provider: telephonyConfig.provider,
        })
        .from(telephonyConfig)
        .where(eq(telephonyConfig.organizationId, organizationId))
        .limit(1);

      if (config.length > 0 && config[0].provider === 'vogent' && config[0].encryptedApiKey) {
        return decryptApiKey(config[0].encryptedApiKey);
      }
    } catch (e) {
      // Fall through to env var
    }
    return process.env.VOGENT_API_KEY || '';
  }

  /**
   * Sync a single call's status from Vogent.
   * Can also be called manually for on-demand sync.
   */
  async syncDial(call: { id: string; externalId: string | null; organizationId: string }) {
    if (!call.externalId) return null;

    // Configure vogentService with the correct per-org API key
    const apiKey = await this.getOrgApiKey(call.organizationId);
    if (apiKey) {
      vogentService.configure(apiKey);
    }

    const dialDetails = await vogentService.getDial(call.externalId);

    const mappedStatus = vogentService.mapDialStatus(dialDetails.status);
    const updateData: Record<string, any> = {
      status: mappedStatus,
      updatedAt: new Date(),
    };

    // Timing
    if (dialDetails.startedAt) {
      updateData.startedAt = new Date(dialDetails.startedAt);
    }
    if (dialDetails.endedAt) {
      updateData.endedAt = new Date(dialDetails.endedAt);
    }
    if (dialDetails.status === 'in-progress' && !updateData.answeredAt) {
      updateData.answeredAt = new Date();
    }

    // Duration — prefer aiDurationSeconds (actual conversation) over durationSeconds (includes ring)
    if ((dialDetails as any).aiDurationSeconds) {
      updateData.durationSeconds = (dialDetails as any).aiDurationSeconds;
    } else if (dialDetails.durationSeconds) {
      updateData.durationSeconds = dialDetails.durationSeconds;
    }

    // Transcript
    if (dialDetails.transcript && dialDetails.transcript.length > 0) {
      updateData.transcript = vogentService.formatTranscript(dialDetails.transcript);
    }

    // Recording
    if (dialDetails.recordings && dialDetails.recordings.length > 0) {
      updateData.recordingUrl = dialDetails.recordings[0].url;
    }

    // Outcome / system result
    if (dialDetails.systemResultType) {
      updateData.outcome = vogentService.mapSystemResult(dialDetails.systemResultType);

      // Voicemail detection
      if (dialDetails.systemResultType === 'VOICEMAIL_DETECTED_HANGUP') {
        updateData.status = 'voicemail';
        updateData.outcome = 'Voicemail - Message Left';
      }
    }

    // Transcript-based voicemail detection
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

    // AI result / extracted data
    if (dialDetails.aiResult) {
      updateData.extractedData = dialDetails.aiResult;
    }

    // Update the call record
    const [updatedCall] = await db.update(calls)
      .set(updateData)
      .where(eq(calls.id, call.id))
      .returning();

    // Emit socket event for real-time UI updates
    if (this.io && call.organizationId) {
      this.io.to(call.organizationId).emit('call:updated', {
        callId: call.id,
        status: updateData.status,
        durationSeconds: updateData.durationSeconds,
        outcome: updateData.outcome,
        transcript: updateData.transcript,
        recordingUrl: updateData.recordingUrl,
      });
    }

    const isTerminal = ['completed', 'failed', 'voicemail', 'busy', 'no_answer'].includes(updateData.status);
    if (isTerminal) {
      console.log(`✅ Vogent call ${call.id} synced → ${updateData.status} (${updateData.durationSeconds || 0}s)`);

      // Update campaign stats if this call belongs to a campaign
      await this.updateCampaignStats(call.id, updateData.status);
    }

    return updatedCall;
  }
  /**
   * Update campaign contact status and aggregate campaign counters
   * when a call reaches a terminal state.
   */
  private async updateCampaignStats(callId: string, callStatus: string) {
    try {
      // Get the call to find campaignId and contactId
      const [call] = await db.select({
        campaignId: calls.campaignId,
        contactId: calls.contactId,
      }).from(calls).where(eq(calls.id, callId)).limit(1);

      if (!call?.campaignId) return; // Not a campaign call

      // Map call status to campaign contact result
      let contactStatus = 'completed';
      let contactResult = callStatus;
      if (['failed', 'busy', 'no_answer'].includes(callStatus)) {
        contactStatus = 'failed';
      } else if (callStatus === 'voicemail') {
        contactStatus = 'completed';
        contactResult = 'voicemail';
      }

      // Update campaign contact
      if (call.contactId) {
        await db.update(campaignContacts)
          .set({
            status: contactStatus,
            result: contactResult,
            completedAt: new Date(),
          })
          .where(and(
            eq(campaignContacts.campaignId, call.campaignId),
            eq(campaignContacts.contactId, call.contactId)
          ));
      }

      // Update campaign aggregate counters
      const counterField = callStatus === 'completed' ? 'connectedCalls'
        : callStatus === 'voicemail' ? 'voicemailCalls'
        : callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no_answer' ? 'failedCalls'
        : 'completedCalls';

      // Always increment completedCalls (total finished) and the specific counter
      const updates: Record<string, any> = {
        completedCalls: sql`${campaigns.completedCalls} + 1`,
        updatedAt: new Date(),
      };
      if (counterField === 'connectedCalls') {
        updates.connectedCalls = sql`${campaigns.connectedCalls} + 1`;
      } else if (counterField === 'voicemailCalls') {
        updates.voicemailCalls = sql`${campaigns.voicemailCalls} + 1`;
      } else if (counterField === 'failedCalls') {
        updates.failedCalls = sql`${campaigns.failedCalls} + 1`;
      }

      await db.update(campaigns)
        .set(updates)
        .where(eq(campaigns.id, call.campaignId));

      console.log(`📊 Campaign ${call.campaignId} stats updated: ${callStatus}`);

      // Emit socket event for real-time campaign UI
      if (this.io) {
        this.io.emit('campaign:stats_updated', {
          campaignId: call.campaignId,
          callStatus,
        });
      }

      // Check if all contacts are done → mark campaign completed
      const pendingContacts = await db.select({ id: campaignContacts.id })
        .from(campaignContacts)
        .where(and(
          eq(campaignContacts.campaignId, call.campaignId),
          inArray(campaignContacts.status, ['pending', 'in_progress'])
        ))
        .limit(1);

      if (pendingContacts.length === 0) {
        await db.update(campaigns)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(campaigns.id, call.campaignId));
        console.log(`✅ Campaign ${call.campaignId} completed — all contacts done`);
        if (this.io) {
          this.io.emit('campaign:completed', { campaignId: call.campaignId });
        }
      }
    } catch (err) {
      console.error('❌ Error updating campaign stats:', err);
    }
  }
}

export const vogentDialPoller = new VogentDialPoller();
