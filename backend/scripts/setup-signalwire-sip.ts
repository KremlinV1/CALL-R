/**
 * Setup SignalWire SIP trunk in LiveKit for making calls
 * Run with: npx ts-node scripts/setup-signalwire-sip.ts
 */

import { SipClient } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID || '';
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN || '';
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL || '';

async function testSignalWireConnection() {
  console.log('\n=== Testing SignalWire Connection ===\n');
  
  const auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');
  
  try {
    // Test API connection by listing phone numbers
    const res = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest/phone_numbers`,
      { 
        headers: { 
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ SignalWire API error: ${res.status} ${text}`);
      return false;
    }
    
    const data = await res.json() as any;
    console.log(`✅ SignalWire connection successful!`);
    console.log(`   Found ${data.data?.length || 0} phone numbers in your account`);
    
    if (data.data && data.data.length > 0) {
      console.log('\n   Available phone numbers:');
      for (const num of data.data) {
        console.log(`   - ${num.number || num.e164} (${num.name || 'unnamed'})`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error connecting to SignalWire:', error);
    return false;
  }
}

async function setupSignalWireSipTrunk() {
  console.log('\n=== Setting up SignalWire SIP Trunk in LiveKit ===\n');
  
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing LiveKit credentials');
    return;
  }

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  // SignalWire SIP endpoint format: <space>.signalwire.com
  // For outbound calls, we need to use their SIP proxy
  const signalwireSipAddress = SIGNALWIRE_SPACE_URL.replace('.signalwire.com', '') + '.sip.signalwire.com';
  
  console.log(`SignalWire SIP Address: ${signalwireSipAddress}`);

  try {
    // Check existing outbound trunks
    const existingTrunks = await sipClient.listSipOutboundTrunk();
    const existingSignalWireTrunk = existingTrunks.find(t => 
      t.name?.toLowerCase().includes('signalwire') || 
      t.address?.includes('signalwire')
    );

    if (existingSignalWireTrunk) {
      console.log(`\n⚠️  SignalWire trunk already exists: ${existingSignalWireTrunk.sipTrunkId}`);
      console.log(`   Name: ${existingSignalWireTrunk.name}`);
      console.log(`   Address: ${existingSignalWireTrunk.address}`);
      console.log(`   Numbers: ${JSON.stringify(existingSignalWireTrunk.numbers)}`);
      return existingSignalWireTrunk.sipTrunkId;
    }

    // Create new SignalWire outbound trunk
    console.log('\nCreating new SignalWire outbound SIP trunk...');
    
    const trunk = await sipClient.createSipOutboundTrunk(
      'SignalWire Outbound',
      signalwireSipAddress,
      [], // Numbers will be added when you import them
      {
        authUsername: SIGNALWIRE_PROJECT_ID,
        authPassword: SIGNALWIRE_API_TOKEN,
        transport: 0, // Auto
      }
    );

    console.log(`\n✅ SignalWire SIP trunk created!`);
    console.log(`   Trunk ID: ${trunk.sipTrunkId}`);
    console.log(`   Address: ${trunk.address}`);
    
    // Update .env with the new trunk ID
    console.log(`\n📝 Add this to your .env file:`);
    console.log(`   LIVEKIT_SIP_TRUNK_SIGNALWIRE=${trunk.sipTrunkId}`);

    return trunk.sipTrunkId;
  } catch (error) {
    console.error('❌ Error setting up SIP trunk:', error);
  }
}

async function main() {
  console.log('SignalWire Configuration:');
  console.log(`  Project ID: ${SIGNALWIRE_PROJECT_ID}`);
  console.log(`  Space URL: ${SIGNALWIRE_SPACE_URL}`);
  console.log(`  API Token: ${SIGNALWIRE_API_TOKEN.substring(0, 10)}...`);

  // Test SignalWire connection first
  const connected = await testSignalWireConnection();
  
  if (!connected) {
    console.log('\n❌ Cannot proceed without valid SignalWire connection');
    process.exit(1);
  }

  // Setup SIP trunk
  await setupSignalWireSipTrunk();

  console.log('\n=== Setup Complete ===\n');
  console.log('Next steps:');
  console.log('1. Import your SignalWire phone numbers via the PON-E-LINE dashboard');
  console.log('2. Assign phone numbers to your agents');
  console.log('3. Make test calls!');
}

main();
