/**
 * Debug script to inspect LiveKit SIP configuration
 * Run with: npx ts-node scripts/debug-sip.ts
 */

import { SipClient } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

async function debugSipConfig() {
  console.log('\n=== LiveKit SIP Configuration Debug ===\n');
  
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing LiveKit credentials in .env');
    process.exit(1);
  }

  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log(`API Key: ${LIVEKIT_API_KEY}`);
  console.log('');

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    // List Inbound Trunks
    console.log('=== INBOUND TRUNKS ===');
    const inboundTrunks = await sipClient.listSipInboundTrunk();
    
    if (inboundTrunks.length === 0) {
      console.log('No inbound trunks configured');
    } else {
      for (const trunk of inboundTrunks) {
        console.log(`\nTrunk ID: ${trunk.sipTrunkId}`);
        console.log(`  Name: ${trunk.name}`);
        console.log(`  Numbers: ${JSON.stringify(trunk.numbers)}`);
        console.log(`  Allowed Addresses: ${JSON.stringify(trunk.allowedAddresses)}`);
        console.log(`  Allowed Numbers: ${JSON.stringify(trunk.allowedNumbers)}`);
        console.log(`  Headers: ${JSON.stringify(trunk.headers)}`);
        console.log(`  Headers to Attributes: ${JSON.stringify(trunk.headersToAttributes)}`);
        console.log(`  Attributes to Headers: ${JSON.stringify(trunk.attributesToHeaders)}`);
        console.log(`  Full object:`, JSON.stringify(trunk, null, 2));
      }
    }

    // List Outbound Trunks
    console.log('\n=== OUTBOUND TRUNKS ===');
    const outboundTrunks = await sipClient.listSipOutboundTrunk();
    
    if (outboundTrunks.length === 0) {
      console.log('No outbound trunks configured');
    } else {
      for (const trunk of outboundTrunks) {
        console.log(`\nTrunk ID: ${trunk.sipTrunkId}`);
        console.log(`  Name: ${trunk.name}`);
        console.log(`  Address: ${trunk.address}`);
        console.log(`  Numbers: ${JSON.stringify(trunk.numbers)}`);
        console.log(`  Transport: ${trunk.transport}`);
        console.log(`  Auth Username: ${trunk.authUsername || '(none)'}`);
        console.log(`  Headers: ${JSON.stringify(trunk.headers)}`);
        console.log(`  Headers to Attributes: ${JSON.stringify(trunk.headersToAttributes)}`);
        console.log(`  Attributes to Headers: ${JSON.stringify(trunk.attributesToHeaders)}`);
        console.log(`  Full object:`, JSON.stringify(trunk, null, 2));
      }
    }

    // List Dispatch Rules
    console.log('\n=== DISPATCH RULES ===');
    const dispatchRules = await sipClient.listSipDispatchRule();
    
    if (dispatchRules.length === 0) {
      console.log('No dispatch rules configured');
    } else {
      for (const rule of dispatchRules) {
        console.log(`\nRule ID: ${rule.sipDispatchRuleId}`);
        console.log(`  Name: ${rule.name}`);
        console.log(`  Trunk IDs: ${JSON.stringify(rule.trunkIds)}`);
        console.log(`  Rule: ${JSON.stringify(rule.rule)}`);
        console.log(`  Room Config: ${JSON.stringify(rule.roomConfig)}`);
        console.log(`  Full object:`, JSON.stringify(rule, null, 2));
      }
    }

    console.log('\n=== AUDIO QUALITY RECOMMENDATIONS ===');
    console.log(`
For choppy audio on SIP calls, check the following:

1. **SIP Trunk Provider Settings:**
   - Ensure your SIP provider (DIDWW, Telnyx, etc.) is using G.711 or Opus codec
   - Check if they support SRTP (encrypted media)
   - Verify the ptime (packet time) is set to 20ms

2. **Network Configuration:**
   - Ensure UDP ports 10000-60000 are open for RTP media
   - Check for NAT issues between your SIP provider and LiveKit

3. **LiveKit Cloud Settings (contact support):**
   - Request they check jitter buffer settings for your project
   - Ask about SIP media transcoding settings
   - Verify the SIP server region matches your SIP provider's region

4. **Agent-side optimizations:**
   - The agent code is now using default settings which should work well
   - TTS sample rate (24000 Hz) matches LiveKit's expected format
`);

  } catch (error) {
    console.error('Error querying SIP config:', error);
  }
}

debugSipConfig();
