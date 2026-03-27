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
  callerIdProfileId: uuid('caller_id_profile_id').references(() => callerIdProfiles.id, { onDelete: 'set null' }),
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
export const telephonyProviderEnum = pgEnum('telephony_provider', ['livekit_sip', 'telnyx']);

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
  
  // Telnyx specific
  telnyxConnectionId: varchar('telnyx_connection_id', { length: 50 }),
  telnyxSipUsername: varchar('telnyx_sip_username', { length: 100 }),
  encryptedTelnyxSipPassword: text('encrypted_telnyx_sip_password'),
  
  // SignalWire specific - Space URL (e.g., "myspace" for myspace.signalwire.com) (legacy/ununsed in LiveKit-only)
  signalwireSpaceUrl: varchar('signalwire_space_url', { length: 255 }),
  
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

// Appointment Status Enum
export const appointmentStatusEnum = pgEnum('appointment_status', ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled']);

// Appointments
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id),
  callId: uuid('call_id').references(() => calls.id),
  agentId: uuid('agent_id').references(() => agents.id),

  // Appointment details
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: appointmentStatusEnum('status').default('scheduled').notNull(),

  // Scheduling
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York').notNull(),
  durationMinutes: integer('duration_minutes').default(30).notNull(),

  // Contact info
  contactName: varchar('contact_name', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 20 }),
  contactEmail: varchar('contact_email', { length: 255 }),

  // Location / meeting
  locationType: varchar('location_type', { length: 50 }).default('phone'), // phone, video, in_person
  locationDetails: text('location_details'), // address, meeting link, etc.

  // Reminders
  reminderSent: boolean('reminder_sent').default(false),
  reminderSentAt: timestamp('reminder_sent_at'),
  confirmationSent: boolean('confirmation_sent').default(false),

  // External calendar sync
  externalCalendarId: varchar('external_calendar_id', { length: 255 }),
  externalEventId: varchar('external_event_id', { length: 255 }),

  // Notes
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Availability Schedules (per org — defines bookable hours)
export const availabilitySchedules = pgTable('availability_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  isDefault: boolean('is_default').default(false),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York').notNull(),

  // Weekly schedule: { "monday": [{ start: "09:00", end: "17:00" }], ... }
  weeklyHours: jsonb('weekly_hours').default({}).notNull(),

  // Booking rules
  slotDurationMinutes: integer('slot_duration_minutes').default(30).notNull(),
  bufferMinutes: integer('buffer_minutes').default(15), // gap between appointments
  minAdvanceHours: integer('min_advance_hours').default(1), // min hours ahead to book
  maxAdvanceDays: integer('max_advance_days').default(30), // max days into future
  maxBookingsPerDay: integer('max_bookings_per_day').default(20),

  // Date overrides (holidays, special hours): [{ date: "2025-12-25", available: false }, ...]
  dateOverrides: jsonb('date_overrides').default([]),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Calendar Integrations (Google, Outlook)
export const calendarIntegrations = pgTable('calendar_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // google, outlook, cal_com
  name: varchar('name', { length: 255 }).notNull(),

  // OAuth tokens (encrypted)
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),

  // Calendar info
  calendarId: varchar('calendar_id', { length: 255 }), // specific calendar within account
  calendarName: varchar('calendar_name', { length: 255 }),
  email: varchar('email', { length: 255 }),

  // Sync settings
  syncEnabled: boolean('sync_enabled').default(true),
  twoWaySync: boolean('two_way_sync').default(true), // also block time from external events
  lastSyncAt: timestamp('last_sync_at'),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRM Provider Enum
export const crmProviderEnum = pgEnum('crm_provider', ['salesforce', 'hubspot', 'pipedrive']);

// CRM Integrations
export const crmIntegrations = pgTable('crm_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  provider: crmProviderEnum('provider').notNull(),
  name: varchar('name', { length: 255 }).notNull(),

  // OAuth / API credentials (encrypted)
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  encryptedApiKey: text('encrypted_api_key'), // For API-key based auth (Pipedrive)
  tokenExpiresAt: timestamp('token_expires_at'),

  // Instance info
  instanceUrl: varchar('instance_url', { length: 500 }), // Salesforce instance URL, HubSpot portal, Pipedrive domain
  accountId: varchar('account_id', { length: 255 }),
  accountName: varchar('account_name', { length: 255 }),

  // Sync settings
  syncContacts: boolean('sync_contacts').default(true),
  syncCalls: boolean('sync_calls').default(true),
  syncAppointments: boolean('sync_appointments').default(false),
  autoCreateContacts: boolean('auto_create_contacts').default(false), // Create CRM contacts from new call contacts
  autoLogCalls: boolean('auto_log_calls').default(true), // Log completed calls to CRM

  // Field mappings: { "phone": "Phone", "email": "Email", ... }
  contactFieldMapping: jsonb('contact_field_mapping').default({}),
  callFieldMapping: jsonb('call_field_mapping').default({}),

  // Status
  isActive: boolean('is_active').default(true),
  lastSyncAt: timestamp('last_sync_at'),
  lastSyncStatus: varchar('last_sync_status', { length: 50 }), // success, error, in_progress
  lastSyncError: text('last_sync_error'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRM Sync Logs
export const crmSyncLogs = pgTable('crm_sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').references(() => crmIntegrations.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  // Sync details
  syncType: varchar('sync_type', { length: 50 }).notNull(), // contacts, calls, appointments, full
  direction: varchar('direction', { length: 20 }).notNull(), // push, pull, bidirectional
  status: varchar('status', { length: 50 }).notNull(), // started, completed, failed

  // Stats
  recordsProcessed: integer('records_processed').default(0),
  recordsCreated: integer('records_created').default(0),
  recordsUpdated: integer('records_updated').default(0),
  recordsFailed: integer('records_failed').default(0),

  // Error info
  errors: jsonb('errors').default([]), // Array of { record, error }

  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// CRM Contact Mappings (link local contacts to CRM records)
export const crmContactMappings = pgTable('crm_contact_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').references(() => crmIntegrations.id).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id).notNull(),
  crmRecordId: varchar('crm_record_id', { length: 255 }).notNull(), // ID in the CRM system
  crmRecordType: varchar('crm_record_type', { length: 100 }).default('contact'), // contact, lead, person, deal
  lastSyncedAt: timestamp('last_synced_at'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Multi-Agent Workflows ──────────────────────────────────────────

// Workflow Status
export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'paused', 'archived']);

// Workflow Node Types
export const workflowNodeTypeEnum = pgEnum('workflow_node_type', [
  'start',           // Entry point
  'agent',           // Connect to AI agent
  'condition',       // Conditional branch (based on sentiment, outcome, keyword, etc.)
  'transfer',        // Transfer to phone/agent
  'hangup',          // End call
  'wait',            // Pause/hold
  'play_message',    // Play TTS or audio
  'collect_input',   // Gather DTMF or speech input
  'webhook',         // Fire external webhook
  'set_variable',    // Set a context variable
  'escalate',        // Escalate to human supervisor
]);

// Workflows (the top-level definition)
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: workflowStatusEnum('status').default('draft').notNull(),
  version: integer('version').default(1).notNull(),

  // Entry config
  triggerType: varchar('trigger_type', { length: 50 }).default('inbound_call'), // inbound_call, outbound_call, manual, scheduled
  triggerConfig: jsonb('trigger_config').default({}), // e.g. { phoneNumbers: [...], agentIds: [...] }

  // Canvas layout (for drag-drop UI)
  canvasData: jsonb('canvas_data').default({}), // { nodes: [...], edges: [...], viewport: {...} }

  // Default context variables
  defaultContext: jsonb('default_context').default({}),

  // Stats
  totalExecutions: integer('total_executions').default(0),
  successfulExecutions: integer('successful_executions').default(0),

  isTemplate: boolean('is_template').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Workflow Nodes (individual steps)
export const workflowNodes = pgTable('workflow_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),

  nodeType: workflowNodeTypeEnum('node_type').notNull(),
  label: varchar('label', { length: 255 }).notNull(),

  // Node-specific config (JSON for flexibility)
  // agent: { agentId, maxDurationSeconds, contextHandoff }
  // condition: { field, operator, value, ... }
  // transfer: { destination, type: 'cold'|'warm', whisper }
  // play_message: { text, voice, language }
  // collect_input: { prompt, inputType: 'dtmf'|'speech', maxDigits }
  // webhook: { url, method, headers, body }
  // set_variable: { key, value }
  // escalate: { reason, notifyChannels }
  config: jsonb('config').default({}).notNull(),

  // Position on canvas
  positionX: integer('position_x').default(0),
  positionY: integer('position_y').default(0),

  // Context preservation: which variables to pass to next node
  preserveContext: jsonb('preserve_context').default([]), // Array of variable names

  // Timeout / fallback
  timeoutSeconds: integer('timeout_seconds'),
  timeoutNodeId: uuid('timeout_node_id'), // Node to go to on timeout

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Workflow Edges (connections between nodes)
export const workflowEdges = pgTable('workflow_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  sourceNodeId: uuid('source_node_id').references(() => workflowNodes.id, { onDelete: 'cascade' }).notNull(),
  targetNodeId: uuid('target_node_id').references(() => workflowNodes.id, { onDelete: 'cascade' }).notNull(),

  // For condition nodes: which output branch
  conditionLabel: varchar('condition_label', { length: 100 }), // e.g. "true", "false", "timeout", "digit_1"
  conditionValue: varchar('condition_value', { length: 255 }), // The value that triggers this edge

  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Workflow Executions (runtime instances)
export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  callId: uuid('call_id').references(() => calls.id),

  status: varchar('status', { length: 50 }).default('running').notNull(), // running, completed, failed, cancelled
  currentNodeId: uuid('current_node_id'),

  // Runtime context (variables accumulated during execution)
  context: jsonb('context').default({}).notNull(),

  // Execution trace: array of { nodeId, nodeType, enteredAt, exitedAt, result }
  trace: jsonb('trace').default([]).notNull(),

  // Error info
  error: text('error'),

  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ─── Caller ID & Number Spoofing ────────────────────────────────────

export const callerIdProfiles = pgTable('caller_id_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  name: varchar('name', { length: 255 }).notNull(),          // e.g. "Main Office", "Sales Line"
  displayNumber: varchar('display_number', { length: 20 }).notNull(), // The number shown to the recipient
  displayName: varchar('display_name', { length: 255 }),      // CNAM caller name (if supported)

  // Spoofing mode
  // 'owned'   — use a number you own on Telnyx (standard, fully compliant)
  // 'custom'  — spoof any arbitrary number (the recipient sees this number)
  mode: varchar('mode', { length: 20 }).default('owned').notNull(),

  // Scope: which entities use this caller ID
  isDefault: boolean('is_default').default(false),            // Org-wide default
  agentIds: jsonb('agent_ids').default([]),                    // Restrict to specific agents (empty = all)
  campaignIds: jsonb('campaign_ids').default([]),              // Restrict to specific campaigns

  // Area-code matching: auto-select this profile when calling numbers in these area codes
  matchAreaCodes: jsonb('match_area_codes').default([]),       // e.g. ["212", "310", "415"]

  // Rotation: if multiple profiles match, rotate through them
  priority: integer('priority').default(0),                    // Higher = preferred
  usageCount: integer('usage_count').default(0),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Communication / Notification Channels ─────────────────────────

export const notificationChannelTypeEnum = pgEnum('notification_channel_type', [
  'slack', 'email', 'sms', 'teams', 'discord', 'webhook',
]);

export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  channelType: notificationChannelTypeEnum('channel_type').notNull(),

  // Channel-specific config (encrypted where appropriate)
  // slack:   { webhookUrl, channel, botToken? }
  // email:   { provider: 'sendgrid'|'postmark'|'ses', apiKey, fromEmail, fromName }
  // sms:     { provider: 'telnyx'|'twilio', apiKey, fromNumber }
  // teams:   { webhookUrl }
  // discord: { webhookUrl }
  // webhook: { url, method, headers, secret }
  config: jsonb('config').default({}).notNull(),

  // Event subscriptions: which events trigger this channel
  // e.g. ['call.completed', 'call.failed', 'campaign.completed', 'appointment.booked']
  subscribedEvents: jsonb('subscribed_events').default([]),

  // Filtering
  agentIds: jsonb('agent_ids').default([]),         // Empty = all agents
  campaignIds: jsonb('campaign_ids').default([]),    // Empty = all campaigns

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').references(() => notificationChannels.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').default({}),

  status: varchar('status', { length: 50 }).notNull(), // sent, failed, pending
  error: text('error'),
  responseCode: integer('response_code'),

  sentAt: timestamp('sent_at').defaultNow().notNull(),
});

// ─── Subscriptions & Usage Tracking ───────────────────────────────

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['free', 'pro', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'cancelled', 'past_due', 'trialing', 'expired']);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  plan: subscriptionPlanEnum('plan').default('free').notNull(),
  status: subscriptionStatusEnum('status').default('active').notNull(),

  // Minutes allocation
  monthlyMinutes: integer('monthly_minutes').default(100).notNull(),   // 100=free, 4000=pro, -1=unlimited
  minutesUsed: integer('minutes_used').default(0).notNull(),           // resets each billing period
  bonusMinutes: integer('bonus_minutes').default(0).notNull(),         // purchased add-ons, don't reset
  bonusMinutesUsed: integer('bonus_minutes_used').default(0).notNull(),

  // Feature limits
  maxAgents: integer('max_agents').default(1).notNull(),               // 1=free, -1=unlimited
  maxPhoneNumbers: integer('max_phone_numbers').default(1).notNull(),  // 1=free, 10=pro, -1=unlimited
  maxCampaigns: integer('max_campaigns').default(1).notNull(),         // 1=free, -1=unlimited

  // Feature flags
  liveMonitorEnabled: boolean('live_monitor_enabled').default(false).notNull(),
  smsEnabled: boolean('sms_enabled').default(false).notNull(),
  dncEnabled: boolean('dnc_enabled').default(false).notNull(),
  analyticsEnabled: boolean('analytics_enabled').default(false).notNull(),
  prioritySupport: boolean('priority_support').default(false).notNull(),

  // Billing period
  currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),

  // Payment provider (for future Stripe integration)
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),

  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),

  // What consumed the minutes
  callId: uuid('call_id').references(() => calls.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id),

  // Usage details
  minutesUsed: integer('minutes_used').default(0).notNull(),     // rounded up to nearest minute
  secondsUsed: integer('seconds_used').default(0).notNull(),     // exact seconds for auditing
  source: varchar('source', { length: 50 }).default('call').notNull(), // call, sms, api
  description: varchar('description', { length: 500 }),

  // Which pool the minutes were deducted from
  fromBonus: boolean('from_bonus').default(false).notNull(),

  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// ─── Do Not Call (DNC) List ────────────────────────────────────────

export const dncReasonEnum = pgEnum('dnc_reason', [
  'manual',           // Added manually by user
  'opt_out',          // Contact opted out during a call
  'dtmf_opt_out',     // Pressed a DTMF key to opt out
  'legal',            // Legal/regulatory requirement
  'complaint',        // Received a complaint
  'imported',         // Imported from CSV or external list
]);

export const dncList = pgTable('dnc_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  reason: dncReasonEnum('reason').default('manual').notNull(),
  source: varchar('source', { length: 255 }), // Who/what added this entry
  notes: text('notes'),
  contactId: uuid('contact_id').references(() => contacts.id),
  callId: uuid('call_id').references(() => calls.id), // The call that triggered the opt-out
  expiresAt: timestamp('expires_at'), // Optional expiry for temporary blocks
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Calling Hours Configuration (per org)
export const callingHoursConfig = pgTable('calling_hours_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull().default('Default'),
  isDefault: boolean('is_default').default(true),
  enabled: boolean('enabled').default(true),

  // Per-day schedule: { "monday": { start: "09:00", end: "20:00" }, ... }
  weeklySchedule: jsonb('weekly_schedule').default({
    monday: { start: '09:00', end: '20:00' },
    tuesday: { start: '09:00', end: '20:00' },
    wednesday: { start: '09:00', end: '20:00' },
    thursday: { start: '09:00', end: '20:00' },
    friday: { start: '09:00', end: '20:00' },
    saturday: { start: '10:00', end: '18:00' },
    sunday: null,
  }).notNull(),

  timezone: varchar('timezone', { length: 100 }).default('America/New_York').notNull(),
  respectContactTimezone: boolean('respect_contact_timezone').default(true),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── SMS Messages ─────────────────────────────────────────────────

export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const messageStatusEnum = pgEnum('message_status', ['queued', 'sent', 'delivered', 'failed', 'received']);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id),
  agentId: uuid('agent_id').references(() => agents.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id),

  direction: messageDirectionEnum('direction').notNull(),
  status: messageStatusEnum('status').default('queued').notNull(),
  fromNumber: varchar('from_number', { length: 20 }).notNull(),
  toNumber: varchar('to_number', { length: 20 }).notNull(),
  body: text('body').notNull(),

  // Provider tracking
  provider: varchar('provider', { length: 50 }).default('telnyx'),
  externalId: varchar('external_id', { length: 255 }),

  // Media (MMS)
  mediaUrls: jsonb('media_urls').default([]),

  // Cost
  costCents: integer('cost_cents').default(0),
  segments: integer('segments').default(1),

  // Error
  errorCode: varchar('error_code', { length: 50 }),
  errorMessage: text('error_message'),

  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Inbound Routing: Ring Groups ─────────────────────────────────

export const ringGroupStrategyEnum = pgEnum('ring_group_strategy', [
  'simultaneous',  // Ring all members at once
  'sequential',    // Ring members one by one
  'round_robin',   // Rotate through members
  'longest_idle',  // Ring the member idle the longest
]);

export const ringGroups = pgTable('ring_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),

  strategy: ringGroupStrategyEnum('strategy').default('simultaneous').notNull(),
  ringTimeSeconds: integer('ring_time_seconds').default(30),
  
  // Members: array of { type: 'agent'|'number', id: string, priority: number }
  members: jsonb('members').default([]).notNull(),

  // Fallback when no one answers
  fallbackAction: varchar('fallback_action', { length: 50 }).default('voicemail'), // voicemail, ivr, number, hangup
  fallbackTarget: varchar('fallback_target', { length: 255 }), // IVR menu ID, phone number, etc.

  // After-hours routing
  afterHoursEnabled: boolean('after_hours_enabled').default(false),
  afterHoursAction: varchar('after_hours_action', { length: 50 }).default('voicemail'),
  afterHoursTarget: varchar('after_hours_target', { length: 255 }),
  callingHoursConfigId: uuid('calling_hours_config_id').references(() => callingHoursConfig.id),

  // Hold music / queue
  holdMusicUrl: varchar('hold_music_url', { length: 500 }),
  queueAnnouncement: text('queue_announcement'), // "Your call is important..."
  maxQueueSize: integer('max_queue_size').default(10),
  maxWaitSeconds: integer('max_wait_seconds').default(300),

  // Phone number assignment: which inbound numbers route to this group
  phoneNumberIds: jsonb('phone_number_ids').default([]),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// IVR Action Types
export const ivrActionTypeEnum = pgEnum('ivr_action_type', [
  'play_message',      // Play audio/TTS message
  'transfer',          // Transfer to phone number or agent
  'voicemail',         // Send to voicemail
  'submenu',           // Go to another IVR menu
  'hangup',            // End the call
  'repeat',            // Repeat current menu
  'agent',             // Connect to AI agent
]);

// IVR Menus
export const ivrMenus = pgTable('ivr_menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false), // Default menu for inbound calls
  
  // Greeting settings
  greetingType: varchar('greeting_type', { length: 20 }).default('tts'), // 'tts' or 'audio'
  greetingText: text('greeting_text'), // TTS text
  greetingAudioUrl: varchar('greeting_audio_url', { length: 500 }), // Pre-recorded audio URL
  
  // Voice settings for TTS
  voiceProvider: varchar('voice_provider', { length: 50 }).default('cartesia'),
  voiceId: varchar('voice_id', { length: 255 }),
  
  // Timeout settings
  inputTimeoutSeconds: integer('input_timeout_seconds').default(5),
  maxRetries: integer('max_retries').default(3),
  invalidInputMessage: text('invalid_input_message').default('Sorry, I didn\'t understand that. Please try again.'),
  timeoutMessage: text('timeout_message').default('I didn\'t receive any input. Goodbye.'),

  // Caller ID — which number/name callers see when this IVR calls out or transfers
  callerIdProfileId: uuid('caller_id_profile_id').references(() => callerIdProfiles.id),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// IVR Menu Options (DTMF key mappings)
export const ivrMenuOptions = pgTable('ivr_menu_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuId: uuid('menu_id').references(() => ivrMenus.id, { onDelete: 'cascade' }).notNull(),
  
  // DTMF key (0-9, *, #)
  dtmfKey: varchar('dtmf_key', { length: 2 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(), // Display label (e.g., "Sales")
  
  // Action configuration
  actionType: ivrActionTypeEnum('action_type').notNull(),
  
  // Action-specific data (stored as JSON for flexibility)
  // For transfer: { phoneNumber: string } or { agentId: string }
  // For submenu: { menuId: string }
  // For play_message: { message: string, tts: boolean }
  // For agent: { agentId: string }
  actionData: jsonb('action_data').default({}),
  
  // Optional announcement before action
  announcementText: text('announcement_text'),
  
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Escrow Claims (Federal Reserve Bank Escrow Accounts) ───────────

export const escrowClaimStatusEnum = pgEnum('escrow_claim_status', ['pending', 'verified', 'processing', 'approved', 'disbursed', 'rejected', 'expired']);

export const escrowClaims = pgTable('escrow_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Claim identification
  claimCode: varchar('claim_code', { length: 20 }).unique().notNull(), // e.g., "FRB-2024-001234"
  pin: varchar('pin', { length: 10 }).notNull(), // Security PIN for verification
  
  // Claimant information
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  ssn4: varchar('ssn_last_4', { length: 4 }), // Last 4 of SSN for verification
  dateOfBirth: varchar('date_of_birth', { length: 10 }), // MM/DD/YYYY
  
  // Address
  address: varchar('address', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 10 }),
  
  // Escrow account details
  escrowAmount: integer('escrow_amount_cents').notNull(), // Amount in cents
  releaseFeeCents: integer('release_fee_cents').default(0), // Fee required to release funds (in cents)
  escrowType: varchar('escrow_type', { length: 100 }).default('federal_reserve'), // federal_reserve, treasury, tax_refund, etc.
  escrowDescription: text('escrow_description'),
  originatingEntity: varchar('originating_entity', { length: 255 }), // e.g., "US Treasury", "IRS", etc.
  
  // Status tracking
  status: escrowClaimStatusEnum('status').default('pending').notNull(),
  verifiedAt: timestamp('verified_at'),
  approvedAt: timestamp('approved_at'),
  disbursedAt: timestamp('disbursed_at'),
  
  // Disbursement details
  disbursementMethod: varchar('disbursement_method', { length: 50 }), // direct_deposit, check, wire
  bankRoutingNumber: varchar('bank_routing_number', { length: 20 }),
  bankAccountNumber: varchar('bank_account_number', { length: 30 }),
  bankAccountType: varchar('bank_account_type', { length: 20 }), // checking, savings
  
  // IVR interaction tracking
  lastCallAt: timestamp('last_call_at'),
  totalCalls: integer('total_calls').default(0),
  failedVerificationAttempts: integer('failed_verification_attempts').default(0),
  isLocked: boolean('is_locked').default(false), // Lock after too many failed attempts
  
  // Notes and metadata
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
  
  expiresAt: timestamp('expires_at'), // Claim expiration date
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// IVR Call Logs (track IVR interactions)
export const ivrCallLogs = pgTable('ivr_call_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  callId: uuid('call_id').references(() => calls.id),
  menuId: uuid('menu_id').references(() => ivrMenus.id),
  
  callerNumber: varchar('caller_number', { length: 20 }),
  dtmfInputs: jsonb('dtmf_inputs').default([]), // Array of { key, timestamp, menuId }
  finalAction: ivrActionTypeEnum('final_action'),
  finalActionData: jsonb('final_action_data').default({}),
  
  durationSeconds: integer('duration_seconds'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
