/**
 * Fix SIP audio quality by updating dispatch rules with proper playout delay settings
 * Run with: npx ts-node scripts/fix-sip-audio.ts
 */

import { SipClient, RoomConfiguration, SIPDispatchRuleInfo } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

async function fixSipAudio() {
  console.log('\n=== Fixing SIP Audio Quality ===\n');
  
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing LiveKit credentials in .env');
    process.exit(1);
  }

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    // List current dispatch rules
    const dispatchRules = await sipClient.listSipDispatchRule();
    
    console.log(`Found ${dispatchRules.length} dispatch rules to update\n`);

    for (const rule of dispatchRules) {
      console.log(`Updating rule: ${rule.name} (${rule.sipDispatchRuleId})`);
      
      // Create updated room config with playout delay settings
      const updatedRoomConfig = new RoomConfiguration({
        minPlayoutDelay: 100,  // 100ms minimum buffer
        maxPlayoutDelay: 400,  // 400ms maximum buffer for jitter
        syncStreams: true,     // Sync audio/video streams
        agents: rule.roomConfig?.agents || [],
        name: rule.roomConfig?.name || '',
        emptyTimeout: rule.roomConfig?.emptyTimeout || 0,
        departureTimeout: rule.roomConfig?.departureTimeout || 0,
        maxParticipants: rule.roomConfig?.maxParticipants || 0,
        metadata: rule.roomConfig?.metadata || '',
      });

      // Create a copy of the rule with updated roomConfig
      const updatedRule = new SIPDispatchRuleInfo({
        sipDispatchRuleId: rule.sipDispatchRuleId,
        rule: rule.rule,
        trunkIds: rule.trunkIds,
        hidePhoneNumber: rule.hidePhoneNumber,
        name: rule.name,
        metadata: rule.metadata,
        inboundNumbers: rule.inboundNumbers,
        attributes: rule.attributes,
        roomPreset: rule.roomPreset,
        roomConfig: updatedRoomConfig,
        krispEnabled: rule.krispEnabled,
        mediaEncryption: rule.mediaEncryption,
      });

      try {
        // Update the dispatch rule by replacing it entirely
        await sipClient.updateSipDispatchRule(rule.sipDispatchRuleId, updatedRule);
        console.log(`  ✅ Updated with minPlayoutDelay=100ms, maxPlayoutDelay=400ms`);
      } catch (updateError: any) {
        console.log(`  ❌ Error updating: ${updateError.message}`);
      }
    }

    console.log('\n=== Verification ===\n');
    
    // Re-fetch and verify
    const updatedRules = await sipClient.listSipDispatchRule();
    for (const rule of updatedRules) {
      console.log(`Rule: ${rule.name}`);
      console.log(`  minPlayoutDelay: ${rule.roomConfig?.minPlayoutDelay || 0}ms`);
      console.log(`  maxPlayoutDelay: ${rule.roomConfig?.maxPlayoutDelay || 0}ms`);
      console.log(`  syncStreams: ${rule.roomConfig?.syncStreams || false}`);
    }

    console.log('\n=== Done ===\n');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixSipAudio();
