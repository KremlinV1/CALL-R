import axios, { AxiosInstance } from 'axios';

const VOGENT_API_URL = 'https://api.vogent.ai/api';

// Vogent API types
export interface VogentAgent {
  id: string;
  name: string;
  language?: string;
  defaultVoiceId?: string;
  defaultVersionedPromptId?: string;
  maxDurationSeconds?: number;
}

export interface VogentPhoneNumber {
  id: string;
  number: string;
  type: 'PSTN' | 'SIP_USERNAME';
  agentId: string | null;
}

export interface VogentModel {
  id: string;
  name: string;
  modelOptions: Array<{
    id: string;
    name: string;
    valueType: string;
    default: string;
  }>;
}

export interface VogentTranscriptEntry {
  text: string;
  speaker: string;
  detailType?: string;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface VogentDial {
  id: string;
  toNumber?: string;
  agent?: VogentAgent;
  recordings?: Array<{ url: string }>;
  transcript?: VogentTranscriptEntry[];
  durationSeconds?: number;
  aiResult?: Record<string, any>;
  inputs?: Record<string, any>;
  status: string;
  dialTaskId?: string;
  fromNumberId?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  systemResultType?: string;
  voiceId?: string;
}

export interface CreateDialOptions {
  callAgentId: string;
  toNumber: string;
  fromNumberId: string;
  webhookUrl?: string;
  browserCall?: boolean;
  timeoutMinutes?: number;
  callAgentInput?: Record<string, any>;
  agentOverrides?: {
    defaultVoiceId?: string;
    defaultVersionedPrompt?: {
      aiModelId: string;
      agentType?: string;
      name?: string;
      prompt: string;
      modelOptionValues?: Array<{ optionId: string; value: string }>;
    };
    openingLine?: {
      lineType: string;
      content: string;
    };
    backgroundNoiseType?: string;
    maxDurationSeconds?: number;
    metadata?: Record<string, any>;
    language?: string;
  };
}

export interface VogentFunction {
  id: string;
  name: string;
  description: string;
  type: 'transfer' | 'api';
  allowedNumbers?: Array<{ number: string }>;
  allowAnyNumber?: boolean;
  lifecycleMessages?: { started: string[] };
}

export interface CreateTransferFunctionOptions {
  name: string;
  description: string;
  allowedNumbers: Array<{ number: string }>;
  lifecycleMessages?: { started: string[] };
}

export interface CreateAgentOptions {
  name: string;
  defaultVoiceId?: string;
  defaultVersionedPrompt: {
    aiModelId: string;
    agentType?: string;
    name?: string;
    prompt: string;
    modelOptionValues?: Array<{ optionId: string; value: string }>;
  };
  openingLine?: {
    lineType: string;
    content: string;
  };
  backgroundNoiseType?: string;
  maxDurationSeconds?: number;
  language?: string;
}

class VogentService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VOGENT_API_KEY || '';
    this.client = axios.create({
      baseURL: VOGENT_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Reconfigure the service with a new API key (e.g. from DB).
   * Call this before making API calls if credentials are stored per-org.
   */
  configure(apiKey: string) {
    this.apiKey = apiKey;
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // ── Agents ──────────────────────────────────────────────

  async listAgents(): Promise<{ data: VogentAgent[]; cursor: string | null }> {
    const res = await this.client.get('/agents');
    return res.data;
  }

  async createAgent(options: CreateAgentOptions): Promise<VogentAgent> {
    const res = await this.client.post('/agents', options);
    return res.data;
  }

  async updateAgent(id: string, options: Partial<CreateAgentOptions> & {
    linkedFunctionDefinitionIds?: string[];
    linkedFunctionDefinitionInputs?: Array<{
      functionDefinitionId: string;
      lifecycleMessagesOverride?: { started: string[] };
    }>;
  }): Promise<VogentAgent> {
    const res = await this.client.put(`/agents/${id}`, options);
    return res.data;
  }

  async deleteAgent(id: string): Promise<void> {
    await this.client.delete(`/agents/${id}`);
  }

  // ── Functions (Transfer, API) ───────────────────────────

  async createTransferFunction(options: CreateTransferFunctionOptions): Promise<VogentFunction> {
    const res = await this.client.post('/functions', {
      name: options.name,
      description: options.description,
      type: 'transfer',
      allowedNumbers: options.allowedNumbers,
      allowAnyNumber: false,
      lifecycleMessages: options.lifecycleMessages || {
        started: ['Please hold while I transfer you.'],
      },
    });
    return res.data;
  }

  async updateTransferFunction(id: string, options: Partial<CreateTransferFunctionOptions>): Promise<VogentFunction> {
    const payload: Record<string, any> = { type: 'transfer' };
    if (options.name) payload.name = options.name;
    if (options.description) payload.description = options.description;
    if (options.allowedNumbers) payload.allowedNumbers = options.allowedNumbers;
    if (options.lifecycleMessages) payload.lifecycleMessages = options.lifecycleMessages;
    const res = await this.client.put(`/functions/${id}`, payload);
    return res.data;
  }

  async listFunctions(): Promise<VogentFunction[]> {
    const res = await this.client.get('/functions');
    return res.data.data || res.data;
  }

  async deleteFunction(id: string): Promise<void> {
    await this.client.delete(`/functions/${id}`);
  }

  /**
   * Ensure a Vogent transfer function exists with the correct allowed numbers.
   * Creates one if none exists, updates if numbers changed.
   * Returns the function ID.
   */
  async ensureTransferFunction(destinations: Array<{ name: string; phoneNumber: string; description?: string }>): Promise<string> {
    const allowedNumbers = destinations
      .filter(d => d.phoneNumber)
      .map(d => ({ number: d.phoneNumber.replace(/[^\d+]/g, '') }));

    if (allowedNumbers.length === 0) {
      throw new Error('No valid transfer destinations configured');
    }

    const deptList = destinations
      .filter(d => d.phoneNumber)
      .map(d => `${d.name}: ${d.phoneNumber}`)
      .join(', ');

    const funcName = 'pon_e_line_transfer';
    const funcDescription = `Transfer the caller to one of these departments: ${deptList}. Use this when the caller requests to speak with a human, a specific department, or when you determine the call should be handled by a person.`;

    // Check if function already exists
    try {
      const existing = await this.listFunctions();
      const found = existing.find(f => f.name === funcName);
      if (found) {
        // Update with latest numbers
        await this.updateTransferFunction(found.id, {
          description: funcDescription,
          allowedNumbers,
        });
        return found.id;
      }
    } catch (e) {
      // List failed — create fresh
    }

    // Create new
    const fn = await this.createTransferFunction({
      name: funcName,
      description: funcDescription,
      allowedNumbers,
      lifecycleMessages: {
        started: ['One moment please, I\'m transferring you now.'],
      },
    });
    return fn.id;
  }

  // ── Dials (Calls) ──────────────────────────────────────

  async createDial(options: CreateDialOptions): Promise<{
    dialToken: string;
    sessionId: string;
    dialId: string;
  }> {
    const res = await this.client.post('/dials', options);
    return res.data;
  }

  async getDial(dialId: string): Promise<VogentDial> {
    const res = await this.client.get(`/dials/${dialId}`);
    return res.data;
  }

  async hangupDial(dialId: string): Promise<{ success: boolean }> {
    const res = await this.client.post(`/dials/${dialId}/hangup`);
    return res.data;
  }

  // ── Phone Numbers ──────────────────────────────────────

  async listPhoneNumbers(): Promise<{ data: VogentPhoneNumber[]; cursor: string | null }> {
    const res = await this.client.get('/phone_numbers');
    return res.data;
  }

  async searchAvailableNumbers(prefix: string, country: string = 'US', limit: number = 5): Promise<Array<{ number: string }>> {
    const res = await this.client.post('/phone_numbers/search', { prefix, country, limit });
    return res.data;
  }

  async purchaseNumber(number: string): Promise<VogentPhoneNumber> {
    const res = await this.client.post('/phone_numbers', {
      type: 'purchase',
      purchase: { number },
    });
    return res.data;
  }

  async deletePhoneNumber(id: string): Promise<void> {
    await this.client.delete(`/phone_numbers/${id}`);
  }

  // ── Models ─────────────────────────────────────────────

  async listModels(): Promise<{ data: VogentModel[]; cursor: string | null }> {
    const res = await this.client.get('/models');
    return res.data;
  }

  // ── Helpers ────────────────────────────────────────────

  /**
   * Build the full system prompt for a call, including voicemail instructions.
   * This is used to update the Vogent base agent before each dial.
   */
  buildPrompt(agent: {
    systemPrompt: string | null;
    voicemailEnabled?: boolean;
    voicemailMessage?: string | null;
    actions?: any;
    transferEnabled?: boolean;
    transferDestinations?: Array<{ name: string; phoneNumber: string; description?: string }>;
  }, contactData?: Record<string, string>): string {
    let prompt = agent.systemPrompt || 'You are a helpful AI phone agent.';

    // Inject transfer instructions if enabled
    if (agent.transferEnabled && agent.transferDestinations && agent.transferDestinations.length > 0) {
      const validDests = agent.transferDestinations.filter(d => d.phoneNumber);
      if (validDests.length > 0) {
        const destList = validDests
          .map(d => `- ${d.name} (${d.phoneNumber})${d.description ? ': ' + d.description : ''}`)
          .join('\n');

        prompt += `\n\n## CALL TRANSFER INSTRUCTIONS
You have the ability to transfer this call to a human agent. Use the transfer function when:
- The caller explicitly asks to speak with a person, manager, or specific department
- You cannot adequately handle the caller's request
- The situation requires human judgment or authority you don't have

Available transfer destinations:
${destList}

When transferring:
1. Let the caller know you're transferring them and to which department
2. Use the pon_e_line_transfer function to execute the transfer
3. Choose the correct phone number from the available destinations

IMPORTANT: Do NOT give out the transfer phone numbers directly. Always use the transfer function.`;
      }
    }

    // Inject voicemail handling instructions if enabled
    const vmConfig = this.extractVoicemailConfig(agent);
    if (vmConfig.enabled && vmConfig.leaveMessage) {
      const cleanMessage = this.resolveVoicemailTemplateVars(vmConfig.message, contactData);

      prompt += `\n\n## VOICEMAIL HANDLING INSTRUCTIONS
When you detect the call has gone to voicemail — for example you hear an automated greeting, a recording, "please leave your message after the tone", or similar — do the following:

1. Stay COMPLETELY SILENT until you hear the beep or tone. Do NOT say anything before the beep. Do NOT narrate what you are doing. Just be quiet and wait.
2. After the beep, speak this message clearly at a natural pace:

"${cleanMessage}"

3. After saying the message, stop speaking and end the call.

CRITICAL RULES:
- NEVER say things like "wait for the beep" or "I'll leave a message" out loud. Those are internal instructions, not things to speak.
- NEVER narrate your actions. Only speak the voicemail message itself.
- NEVER try to have a conversation with a voicemail greeting or automated system.
- If the voicemail system hangs up before you finish, that is okay.`;
    } else if (vmConfig.enabled && !vmConfig.leaveMessage) {
      prompt += `\n\n## VOICEMAIL HANDLING INSTRUCTIONS
If you detect that the call has gone to voicemail (you hear an automated greeting, a recording, or a message like "please leave a message after the tone"), hang up immediately without saying anything.`;
    }

    return prompt;
  }

  /**
   * Build agent overrides for a Vogent dial.
   * Includes our custom prompt and model but uses Vogent's configured voice.
   */
  buildAgentOverrides(agent: {
    name: string;
    systemPrompt: string | null;
    voiceId?: string | null;
    voiceSettings?: any;
    llmModel?: string | null;
    llmSettings?: any;
    voicemailEnabled?: boolean;
    voicemailMessage?: string | null;
    actions?: any;
    transferEnabled?: boolean;
    transferDestinations?: Array<{ name: string; phoneNumber: string; description?: string }>;
  }, vogentModelId: string, contactData?: Record<string, string>): CreateDialOptions['agentOverrides'] {
    const modelOptionValues: Array<{ optionId: string; value: string }> = [];

    // Map temperature
    const temp = agent.llmSettings?.temperature;
    if (temp !== undefined) {
      modelOptionValues.push({ optionId: 'temperature', value: String(temp) });
    }

    // Map max tokens
    const maxTokens = agent.llmSettings?.maxTokens;
    if (maxTokens !== undefined) {
      modelOptionValues.push({ optionId: 'max_tokens', value: String(maxTokens) });
    }

    // Build the full prompt (includes voicemail instructions)
    const prompt = this.buildPrompt(agent, contactData);

    // Build opening line from voice settings, resolving template variables
    let openingMessage = agent.voiceSettings?.openingMessage;
    if (openingMessage) {
      openingMessage = this.resolveVoicemailTemplateVars(openingMessage, contactData);
    }

    const overrides: CreateDialOptions['agentOverrides'] = {
      defaultVersionedPrompt: {
        aiModelId: vogentModelId,
        agentType: 'STANDARD',
        name: agent.name,
        prompt,
        modelOptionValues,
      },
      maxDurationSeconds: 600, // 10 min default
      language: 'en',
      // NOTE: No defaultVoiceId — uses Vogent's configured voice
    };

    if (openingMessage) {
      overrides!.openingLine = {
        lineType: 'INBOUND_OUTBOUND',
        content: openingMessage,
      };
    }

    // Map background noise
    const bgNoise = agent.voiceSettings?.backgroundNoise;
    if (bgNoise?.enabled && bgNoise.type && bgNoise.type !== 'none') {
      overrides!.backgroundNoiseType = bgNoise.type;
    }

    return overrides;
  }

  /**
   * Extract voicemail configuration from agent fields.
   * Checks both dedicated columns and the actions jsonb array.
   */
  extractVoicemailConfig(agent: {
    voicemailEnabled?: boolean;
    voicemailMessage?: string | null;
    actions?: any;
  }): { enabled: boolean; leaveMessage: boolean; message: string } {
    const defaultMessage = "Hi, this is a call from our team. We were trying to reach you. Please call us back at your earliest convenience. Thank you!";

    // Check dedicated columns first
    if (agent.voicemailEnabled !== undefined) {
      // Also look for detailed config in the actions array
      let vmActionConfig: any = null;
      if (Array.isArray(agent.actions)) {
        const vmAction = agent.actions.find((a: any) => a.type === 'leaveVoicemail' && a.enabled);
        vmActionConfig = vmAction?.config;
      }

      return {
        enabled: agent.voicemailEnabled ?? false,
        leaveMessage: vmActionConfig?.leaveMessage ?? true,
        message: vmActionConfig?.message || agent.voicemailMessage || defaultMessage,
      };
    }

    // Fallback: check actions array only
    if (Array.isArray(agent.actions)) {
      const vmAction = agent.actions.find((a: any) => a.type === 'leaveVoicemail' && a.enabled);
      if (vmAction) {
        return {
          enabled: true,
          leaveMessage: vmAction.config?.leaveMessage ?? true,
          message: vmAction.config?.message || defaultMessage,
        };
      }
    }

    return { enabled: false, leaveMessage: false, message: defaultMessage };
  }

  /**
   * Replace template variables like {{first_name}} with generic fallbacks
   * so the AI doesn't literally say "{{first_name}}" on a voicemail.
   */
  resolveVoicemailTemplateVars(message: string, contactData?: Record<string, string>): string {
    return message.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      // Use contact data if available, otherwise just remove the variable
      if (contactData && contactData[key]) return contactData[key];
      return '';
    }).replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Map Vogent dial status to our internal call status.
   */
  mapDialStatus(vogentStatus: string): string {
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
      'canceled': 'failed',
      'busy': 'busy',
      'no-answer': 'no_answer',
    };
    return statusMap[vogentStatus] || 'failed';
  }

  /**
   * Map Vogent systemResultType to an outcome string.
   */
  mapSystemResult(resultType: string | undefined): string | null {
    if (!resultType) return null;
    const resultMap: Record<string, string> = {
      'BUSY': 'Busy',
      'FAILED': 'Failed',
      'NO_ANSWER': 'No Answer',
      'CANCELLED': 'Cancelled',
      'USER_HANGUP': 'User Hangup',
      'COUNTERPARTY_HANGUP': 'Counterparty Hangup',
      'TIMEOUT': 'Timeout',
      'RATE_LIMITED': 'Rate Limited',
      'TRANSFERRED': 'Transferred',
      'AGENT_HANGUP': 'Agent Hangup',
      'VOICEMAIL_DETECTED_HANGUP': 'Voicemail',
      'LONG_SILENCE_HANGUP': 'Silence Hangup',
    };
    return resultMap[resultType] || resultType;
  }

  /**
   * Convert Vogent transcript entries to a readable string.
   */
  formatTranscript(entries: VogentTranscriptEntry[]): string {
    return entries
      .filter(e => e.text && e.speaker)
      .map(e => `${e.speaker}: ${e.text}`)
      .join('\n');
  }
}

// Singleton
export const vogentService = new VogentService();
