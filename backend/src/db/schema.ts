import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const agentStatusEnum = pgEnum('agent_status', ['active', 'paused', 'draft']);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']);
export const contactStatusEnum = pgEnum('contact_status', ['new', 'contacted', 'qualified', 'unqualified', 'converted']);
export const callStatusEnum = pgEnum('call_status', ['queued', 'ringing', 'in_progress', 'completed', 'failed', 'voicemail', 'busy', 'no_answer']);
export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound']);
export const rotationStrategyEnum = pgEnum('rotation_strategy', ['round_robin', 'random', 'least_used', 'weighted']);

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  website: varchar('website', { length: 255 }),
  timezone: varchar('timezone', { length: 50 }).default('America/New_York'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  role: userRoleEnum('role').default('member').notNull(),
  emailVerified: boolean('email_verified').default(false),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Agents
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: agentStatusEnum('status').default('draft').notNull(),
  systemPrompt: text('system_prompt'),
  
  // Voice settings
  voiceProvider: varchar('voice_provider', { length: 50 }).default('cartesia'),
  voiceId: varchar('voice_id', { length: 255 }),
  voiceSettings: jsonb('voice_settings').default({}),
  
  // LLM settings
  llmProvider: varchar('llm_provider', { length: 50 }).default('openai'),
  llmModel: varchar('llm_model', { length: 100 }).default('gpt-4o'),
  llmSettings: jsonb('llm_settings').default({}),
  
  // STT settings
  sttProvider: varchar('stt_provider', { length: 50 }).default('deepgram'),
  sttSettings: jsonb('stt_settings').default({}),
  
  // Actions & tools
  actions: jsonb('actions').default([]),
  
  // Voicemail settings
  voicemailEnabled: boolean('voicemail_enabled').default(true),
  voicemailAction: varchar('voicemail_action', { length: 50 }).default('leave_message'),
  voicemailMessage: text('voicemail_message'),
  
  // Transfer settings
  transferEnabled: boolean('transfer_enabled').default(false),
  transferDestinations: jsonb('transfer_destinations').default([]),
  
  // Stats
  totalCalls: integer('total_calls').default(0),
  successfulCalls: integer('successful_calls').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Contact Lists
export const contactLists = pgTable('contact_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }).default('#3b82f6'),
  contactCount: integer('contact_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Contacts
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  listId: uuid('list_id').references(() => contactLists.id),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  phone: varchar('phone', { length: 20 }).notNull(),
  email: varchar('email', { length: 255 }),
  company: varchar('company', { length: 255 }),
  status: contactStatusEnum('status').default('new').notNull(),
  tags: jsonb('tags').default([]),
  customFields: jsonb('custom_fields').default({}),
  totalCalls: integer('total_calls').default(0),
  lastCalledAt: timestamp('last_called_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Campaigns
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: campaignStatusEnum('status').default('draft').notNull(),
  
  // Contact list
  contactListId: uuid('contact_list_id').references(() => contactLists.id),
  
  // Phone number configuration
  phoneNumberPoolId: uuid('phone_number_pool_id').references(() => phoneNumberPools.id),
  singlePhoneNumber: varchar('single_phone_number', { length: 20 }), // Fallback to single number
  
  // Scheduling
  scheduledStartAt: timestamp('scheduled_start_at'),
  scheduledEndAt: timestamp('scheduled_end_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  // Advanced scheduling
  scheduleType: varchar('schedule_type', { length: 50 }).default('immediate'), // immediate, scheduled, recurring
  recurringPattern: varchar('recurring_pattern', { length: 50 }), // daily, weekly, monthly
  recurringDays: jsonb('recurring_days'), // [0,1,2,3,4] for Mon-Fri
  timeWindowStart: varchar('time_window_start', { length: 10 }), // "09:00"
  timeWindowEnd: varchar('time_window_end', { length: 10 }), // "17:00"
  timezone: varchar('timezone', { length: 100 }).default('America/New_York'),
  
  // Throttling
  callsPerMinute: integer('calls_per_minute').default(10),
  maxConcurrentCalls: integer('max_concurrent_calls').default(5),
  
  // Voicemail settings
  voicemailAction: varchar('voicemail_action', { length: 50 }).default('leave_message'),
  
  // Stats
  totalContacts: integer('total_contacts').default(0),
  completedCalls: integer('completed_calls').default(0),
  connectedCalls: integer('connected_calls').default(0),
  voicemailCalls: integer('voicemail_calls').default(0),
  failedCalls: integer('failed_calls').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Campaign Contacts (junction table)
export const campaignContacts = pgTable('campaign_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaigns.id).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id).notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  attempts: integer('attempts').default(0),
  attemptedAt: timestamp('attempted_at'),
  lastAttemptAt: timestamp('last_attempt_at'),
  completedAt: timestamp('completed_at'),
  result: varchar('result', { length: 100 }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Calls
export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  contactId: uuid('contact_id').references(() => contacts.id),
  
  // External provider tracking (e.g. Vogent dial ID)
  externalId: varchar('external_id', { length: 255 }),
  provider: varchar('call_provider', { length: 50 }).default('livekit'),
  
  // Call info
  direction: callDirectionEnum('direction').notNull(),
  status: callStatusEnum('status').default('queued').notNull(),
  fromNumber: varchar('from_number', { length: 20 }).notNull(),
  toNumber: varchar('to_number', { length: 20 }).notNull(),
  
  // Timing
  startedAt: timestamp('started_at'),
  answeredAt: timestamp('answered_at'),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  
  // Recording & Transcript
  recordingUrl: varchar('recording_url', { length: 500 }),
  transcript: text('transcript'),
  
  // Analysis
  summary: text('summary'),
  sentiment: varchar('sentiment', { length: 20 }),
  outcome: varchar('outcome', { length: 100 }),
  qualityScore: integer('quality_score'),
  extractedData: jsonb('extracted_data').default({}),
  
  // Cost
  costCents: integer('cost_cents').default(0),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Phone Numbers
export const phoneNumbers = pgTable('phone_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  number: varchar('number', { length: 20 }).unique().notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerSid: varchar('provider_sid', { length: 255 }),
  label: varchar('label', { length: 100 }),
  type: varchar('type', { length: 20 }).default('local'),
  capabilities: jsonb('capabilities').default({}),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// API Keys
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Webhooks
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  events: jsonb('events').default([]),
  secret: varchar('secret', { length: 255 }),
  active: boolean('active').default(true),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// AI Provider Keys (encrypted)
export const aiProviderKeysEnum = pgEnum('ai_provider', ['openai', 'anthropic', 'deepgram', 'cartesia', 'elevenlabs', 'livekit', 'groq', 'google']);

export const aiProviderKeys = pgTable('ai_provider_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  provider: aiProviderKeysEnum('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }),  // e.g., "sk-...abc" for display
  isConfigured: boolean('is_configured').default(true),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Telephony Provider Configuration
export const telephonyProviderEnum = pgEnum('telephony_provider', ['twilio', 'telnyx', 'vonage', 'signalwire', 'livekit_sip', 'vogent']);

export const telephonyConfig = pgTable('telephony_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull().unique(),
  provider: telephonyProviderEnum('provider').notNull(),
  
  // Encrypted credentials (different per provider)
  encryptedAccountSid: text('encrypted_account_sid'),  // Twilio Account SID, Vonage API Key, SignalWire Project ID
  encryptedAuthToken: text('encrypted_auth_token'),     // Auth token / API secret / API Token
  encryptedApiKey: text('encrypted_api_key'),           // Additional API key if needed (Telnyx)
  
  // Display prefixes for UI
  accountSidPrefix: varchar('account_sid_prefix', { length: 20 }),
  authTokenPrefix: varchar('auth_token_prefix', { length: 20 }),
  
  // LiveKit SIP specific
  livekitSipUri: varchar('livekit_sip_uri', { length: 255 }),
  
  // SignalWire specific - Space URL (e.g., "myspace" for myspace.signalwire.com)
  signalwireSpaceUrl: varchar('signalwire_space_url', { length: 255 }),
  
  // Vogent specific
  vogentBaseAgentId: varchar('vogent_base_agent_id', { length: 255 }),
  vogentPhoneNumberId: varchar('vogent_phone_number_id', { length: 255 }),
  vogentDefaultModelId: varchar('vogent_default_model_id', { length: 255 }),
  
  isConfigured: boolean('is_configured').default(false),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Phone Number Pools
export const phoneNumberPools = pgTable('phone_number_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  rotationStrategy: rotationStrategyEnum('rotation_strategy').default('round_robin').notNull(),
  
  // Rotation settings
  rotationIntervalMinutes: integer('rotation_interval_minutes').default(60), // Switch numbers every X minutes
  maxCallsPerNumber: integer('max_calls_per_number').default(100), // Max calls before rotating
  cooldownMinutes: integer('cooldown_minutes').default(30), // Rest time after heavy use
  
  // Health monitoring
  isActive: boolean('is_active').default(true),
  totalCalls: integer('total_calls').default(0),
  activeNumbers: integer('active_numbers').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Junction table for pool-to-phone-number relationship
export const poolPhoneNumbers = pgTable('pool_phone_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolId: uuid('pool_id').references(() => phoneNumberPools.id, { onDelete: 'cascade' }).notNull(),
  phoneNumberId: uuid('phone_number_id').references(() => phoneNumbers.id, { onDelete: 'cascade' }).notNull(),
  
  // Per-number stats within pool
  callsMade: integer('calls_made').default(0),
  lastUsedAt: timestamp('last_used_at'),
  isHealthy: boolean('is_healthy').default(true),
  spamScore: integer('spam_score').default(0), // 0-100, higher = more likely flagged
  cooldownUntil: timestamp('cooldown_until'),
  
  // Priority/weight for weighted rotation
  weight: integer('weight').default(1),
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
