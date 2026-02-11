import 'dotenv/config';
import { db } from './index';
import { 
  organizations, 
  users, 
  agents, 
  contacts, 
  campaigns,
  phoneNumbers
} from './schema';
import { hash } from '@node-rs/argon2';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  try {
    // Create organization
    console.log('📁 Creating organization...');
    const [org] = await db.insert(organizations).values({
      name: 'Demo Company',
      slug: 'demo-company',
      website: 'https://demo.com',
      timezone: 'America/New_York',
      settings: {
        callRecording: true,
        voicemailDetection: true,
      },
    }).returning();
    console.log(`   ✓ Created org: ${org.name} (${org.id})`);

    // Create admin user
    console.log('\n👤 Creating users...');
    const hashedPassword = await hash('password123');
    
    const [adminUser] = await db.insert(users).values({
      organizationId: org.id,
      email: 'admin@demo.com',
      passwordHash: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'admin',
    }).returning();
    console.log(`   ✓ Admin: ${adminUser.email} (password: password123)`);

    await db.insert(users).values([
      {
        organizationId: org.id,
        email: 'agent@demo.com',
        passwordHash: hashedPassword,
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'member',
      },
    ]);
    console.log(`   ✓ Member: agent@demo.com (password: password123)`);

    // Create phone numbers
    console.log('\n📞 Creating phone numbers...');
    await db.insert(phoneNumbers).values([
      {
        organizationId: org.id,
        number: '+15551234567',
        provider: 'twilio',
        label: 'Main Line',
        type: 'local',
        capabilities: { voice: true, sms: true },
        status: 'active',
      },
      {
        organizationId: org.id,
        number: '+15559876543',
        provider: 'twilio',
        label: 'Sales Line',
        type: 'local',
        capabilities: { voice: true },
        status: 'active',
      },
    ]);
    console.log('   ✓ Created 2 phone numbers');

    // Create agents
    console.log('\n🤖 Creating agents...');
    const [salesAgent] = await db.insert(agents).values([
      {
        organizationId: org.id,
        name: 'Sales Agent',
        description: 'Handles outbound sales calls and lead qualification',
        status: 'active',
        systemPrompt: `You are a friendly and professional sales representative for Demo Company. 
Your goal is to qualify leads and schedule demos.
- Be conversational but professional
- Ask about their current challenges
- Explain our solution benefits
- Try to schedule a demo or follow-up call`,
        voiceProvider: 'cartesia',
        voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
        voiceSettings: { speed: 1.0, pitch: 1.0 },
        llmProvider: 'openai',
        llmModel: 'gpt-4o-mini',
        llmSettings: { temperature: 0.7, maxTokens: 500 },
      },
      {
        organizationId: org.id,
        name: 'Support Agent',
        description: 'Handles customer support and inquiries',
        status: 'active',
        systemPrompt: `You are a helpful customer support agent for Demo Company.
Your goal is to assist customers with their questions and issues.
- Be empathetic and patient
- Ask clarifying questions
- Provide clear solutions
- Escalate if needed`,
        voiceProvider: 'elevenlabs',
        voiceId: 'rachel',
        voiceSettings: { stability: 0.5, similarity: 0.75 },
        llmProvider: 'openai',
        llmModel: 'gpt-4o-mini',
        llmSettings: { temperature: 0.5, maxTokens: 500 },
      },
      {
        organizationId: org.id,
        name: 'Appointment Setter',
        description: 'Books appointments and manages scheduling',
        status: 'draft',
        systemPrompt: `You are an appointment scheduling assistant.
Your goal is to book appointments efficiently.
- Confirm availability
- Book the appointment
- Send confirmation details`,
        voiceProvider: 'cartesia',
        voiceId: 'b7d50908-b17c-442d-ad8d-810c63997ed9',
        voiceSettings: { speed: 1.1, pitch: 1.0 },
        llmProvider: 'anthropic',
        llmModel: 'claude-3-haiku',
        llmSettings: { temperature: 0.3, maxTokens: 300 },
      },
    ]).returning();
    console.log('   ✓ Created 3 agents');

    // Create contacts
    console.log('\n👥 Creating contacts...');
    const contactsData = [
      { firstName: 'Alice', lastName: 'Johnson', phone: '+15551001001', email: 'alice@example.com', company: 'Tech Corp', status: 'new' as const },
      { firstName: 'Bob', lastName: 'Williams', phone: '+15551001002', email: 'bob@example.com', company: 'Startup Inc', status: 'contacted' as const },
      { firstName: 'Carol', lastName: 'Davis', phone: '+15551001003', email: 'carol@example.com', company: 'Enterprise Ltd', status: 'qualified' as const },
      { firstName: 'David', lastName: 'Brown', phone: '+15551001004', email: 'david@example.com', company: 'Growth Co', status: 'new' as const },
      { firstName: 'Eva', lastName: 'Miller', phone: '+15551001005', email: 'eva@example.com', company: 'Scale Up', status: 'converted' as const },
      { firstName: 'Frank', lastName: 'Garcia', phone: '+15551001006', email: 'frank@example.com', company: 'Big Business', status: 'new' as const },
      { firstName: 'Grace', lastName: 'Martinez', phone: '+15551001007', email: 'grace@example.com', company: 'Small Biz', status: 'contacted' as const },
      { firstName: 'Henry', lastName: 'Anderson', phone: '+15551001008', email: 'henry@example.com', company: 'Medium Corp', status: 'new' as const },
      { firstName: 'Ivy', lastName: 'Thomas', phone: '+15551001009', email: 'ivy@example.com', company: 'Innovate LLC', status: 'qualified' as const },
      { firstName: 'Jack', lastName: 'Jackson', phone: '+15551001010', email: 'jack@example.com', company: 'Future Tech', status: 'new' as const },
    ];

    await db.insert(contacts).values(
      contactsData.map(c => ({ ...c, organizationId: org.id, tags: ['lead', 'demo'] }))
    );
    console.log('   ✓ Created 10 contacts');

    // Create a campaign
    console.log('\n📢 Creating campaigns...');
    await db.insert(campaigns).values([
      {
        organizationId: org.id,
        agentId: salesAgent.id,
        name: 'Q4 Sales Outreach',
        description: 'End of year sales push to qualified leads',
        status: 'running',
        callsPerMinute: 5,
        maxConcurrentCalls: 3,
        voicemailAction: 'leave_message',
        totalContacts: 500,
        completedCalls: 342,
        connectedCalls: 215,
        voicemailCalls: 87,
        failedCalls: 40,
      },
      {
        organizationId: org.id,
        agentId: salesAgent.id,
        name: 'New Product Launch',
        description: 'Announcing our new product to existing customers',
        status: 'draft',
        callsPerMinute: 10,
        maxConcurrentCalls: 5,
        voicemailAction: 'hangup',
        totalContacts: 1200,
        completedCalls: 0,
        connectedCalls: 0,
        voicemailCalls: 0,
        failedCalls: 0,
      },
    ]);
    console.log('   ✓ Created 2 campaigns');

    console.log('\n✅ Seed completed successfully!\n');
    console.log('📧 Login credentials:');
    console.log('   Email: admin@demo.com');
    console.log('   Password: password123\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

seed();
