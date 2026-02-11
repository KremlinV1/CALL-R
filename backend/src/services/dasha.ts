import axios, { AxiosInstance } from 'axios';

// ─── Dasha BlackBox API Types ────────────────────────────────────

export interface DashaAgent {
  agentId: string;
  orgId: string;
  name: string;
  config: any;
  isEnabled: boolean;
  description: string | null;
  additionalData: Record<string, string>;
  createdTime: string;
  lastUpdateTime: string;
}

export interface DashaCall {
  callId: string;
  agentId: string;
  endpoint: string;
  status: string;
  priority: number;
  createdTime: string;
  nextScheduleTime?: string;
}

export interface DashaBulkCallResponse {
  total: number;
  scheduled: Array<{ callId: string; endpoint: string; status: string }>;
  failed: Array<{ endpoint: string; error: string }>;
}

export interface DashaCompletedPayload {
  type: 'CompletedWebHookPayload';
  status: string;
  callId: string;
  agentId: string;
  orgId: string;
  endpoint: string;
  callType: string;
  callAdditionalData: Record<string, unknown>;
  createdTime: string;
  completedTime: string;
  durationSeconds: number;
  recordingUrl?: string;
  result: {
    finishReason: string;
    status: string;
    postCallAnalysis?: Record<string, unknown>;
  };
  transcription?: Array<{ speaker: string; text: string; startTime: string; endTime: string }>;
}

export interface DashaFailedPayload {
  type: 'FailedWebHookPayload';
  status: string;
  callId: string;
  agentId: string;
  endpoint: string;
  createdTime: string;
  completedTime: string;
  errorMessage: string;
}

export interface DashaStartPayload {
  type: 'StartWebHookPayload';
  callId: string;
  agentId: string;
  endpoint: string;
  callAdditionalData: Record<string, unknown>;
}

// ─── DashaService ────────────────────────────────────────────────

const DASHA_BASE_URL = 'https://blackbox.dasha.ai/api/v1';

class DashaService {
  private apiKey: string = '';
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({ baseURL: DASHA_BASE_URL, timeout: 30_000 });
  }

  configure(apiKey: string) {
    this.apiKey = apiKey;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
    this.client.defaults.headers.common['Content-Type'] = 'application/json';
  }

  isConfigured(): boolean { return !!this.apiKey; }

  // ── Agent CRUD ────────────────────────────────────────

  async createAgent(request: any): Promise<DashaAgent> {
    const { data } = await this.client.post('/agents', request);
    return data;
  }

  async getAgent(agentId: string): Promise<DashaAgent> {
    const { data } = await this.client.get(`/agents/${agentId}`);
    return data;
  }

  async updateAgent(agentId: string, request: any): Promise<DashaAgent> {
    const { data } = await this.client.put(`/agents/${agentId}`, request);
    return data;
  }

  async listAgents(): Promise<DashaAgent[]> {
    const { data } = await this.client.get('/agents', { params: { skip: 0, take: 100 } });
    return data;
  }

  // ── Call Scheduling ───────────────────────────────────

  async scheduleCall(agentId: string, endpoint: string, priority = 5, additionalData?: Record<string, string>): Promise<DashaCall> {
    const { data } = await this.client.post('/calls', { agentId, endpoint, priority, additionalData });
    return data;
  }

  async scheduleBulkCalls(agentId: string, calls: Array<{ endpoint: string; priority?: number; additionalData?: Record<string, string> }>): Promise<DashaBulkCallResponse> {
    const { data } = await this.client.post('/calls/bulk', { agentId, calls });
    return data;
  }

  async getCall(callId: string): Promise<DashaCall> {
    const { data } = await this.client.get(`/calls/${callId}`);
    return data;
  }

  async cancelCall(callId: string): Promise<void> {
    await this.client.delete(`/calls/${callId}`);
  }

  // ── Agent Config Builder ──────────────────────────────

  buildDashaAgentConfig(agent: {
    name: string;
    systemPrompt?: string | null;
    voiceProvider?: string | null;
    voiceId?: string | null;
    voiceSettings?: any;
    llmProvider?: string | null;
    llmModel?: string | null;
    llmSettings?: any;
    actions?: any;
    voicemailEnabled?: boolean;
    voicemailMessage?: string | null;
    transferEnabled?: boolean;
    transferDestinations?: any;
  }, webhookBaseUrl: string) {
    const vs = (agent.voiceSettings || {}) as Record<string, any>;
    const ls = (agent.llmSettings || {}) as Record<string, any>;
    const ivrCfg = this.extractIvrConfig(agent);
    const bgNoise = vs.backgroundNoise || {};
    const prompt = this.buildPrompt(agent);

    return {
      name: agent.name,
      config: {
        primaryLanguage: 'en-US',
        ttsConfig: {
          voiceId: agent.voiceId || '',
          vendor: agent.voiceProvider || 'cartesia',
          speed: vs.speed || 1,
        },
        llmConfig: {
          model: agent.llmModel || 'gpt-4o-mini',
          vendor: agent.llmProvider || 'openai',
          prompt,
          options: { temperature: ls.temperature ?? 0.7, maxTokens: ls.maxTokens ?? 500 },
        },
        sttConfig: { version: 'v1', vendor: 'Auto', vendorSpecificOptions: {} },
        resultWebhook: { url: `${webhookBaseUrl}/api/webhooks/dasha`, headers: {} },
        features: {
          version: 'v1',
          talkFirst: { version: 'v1', delay: 1, isEnabled: !!vs.openingMessage, interruptible: true },
          maxDuration: { version: 'v1', maxDurationSeconds: 3600, maxDurationInTransferSeconds: 7200, isEnabled: true },
          ivrDetection: { version: 'v1', isEnabled: true, enabledForChat: false, enabledForInbound: false, enabledForOutbound: true, enabledForWebCall: false, ivrNavigation: ivrCfg.enabled },
          ambientNoise: { version: 'v1', isEnabled: bgNoise.enabled || false, ambientNoiseLevel: bgNoise.volume || 0.1 },
          silenceManagement: { version: 'v1', isEnabled: true, maxReminderAttempts: 2, reminderSilenceThresholdSeconds: 5, endWhenReminderLimitExceeded: true },
        },
      },
      isEnabled: true,
      description: 'Auto-created from Pon-E-Line agent',
      additionalData: {},
    };
  }

  // ── Prompt Builder ────────────────────────────────────

  buildPrompt(agent: {
    systemPrompt?: string | null;
    voicemailEnabled?: boolean;
    voicemailMessage?: string | null;
    actions?: any;
    transferEnabled?: boolean;
    transferDestinations?: any;
  }): string {
    let prompt = agent.systemPrompt || '';

    if (agent.transferEnabled) {
      const dests = (agent.transferDestinations as Array<{ name: string; phoneNumber: string; description?: string }>) || [];
      const valid = dests.filter(d => d.phoneNumber);
      if (valid.length > 0) {
        prompt += `\n\n## CALL TRANSFER INSTRUCTIONS\nAvailable transfer destinations:\n${valid.map(d => `- ${d.name}${d.description ? ` (${d.description})` : ''}: ${d.phoneNumber}`).join('\n')}\nTo transfer, tell the caller you're transferring them and use the transfer tool.`;
      }
    }

    if (agent.voicemailEnabled && agent.voicemailMessage) {
      prompt += `\n\n## VOICEMAIL INSTRUCTIONS\nIf the call goes to voicemail, leave this message:\n"${agent.voicemailMessage}"\nThen end the call.`;
    }

    const ivrCfg = this.extractIvrConfig(agent);
    if (ivrCfg.enabled) {
      prompt += `\n\n## IVR / PHONE MENU NAVIGATION\nWhen you encounter an automated phone system:\n1. LISTEN to all menu options.\n2. SAY the digit clearly ("one", "two") — do NOT say "press".\n3. For extensions, say each digit with pauses.\n4. Say "pound" or "star" when asked.\n5. Wait silently during hold music.\n6. If you reach a human, proceed normally.\n${ivrCfg.targetOption ? `PREFERRED NAVIGATION: ${ivrCfg.targetOption}\n` : ''}RULES: Never narrate actions. Be patient. After 3 stuck attempts, say "operator" or "zero".`;
    }

    return prompt;
  }

  // ── Helpers ───────────────────────────────────────────

  extractIvrConfig(agent: { actions?: any }): { enabled: boolean; targetOption: string } {
    if (Array.isArray(agent.actions)) {
      const ivr = agent.actions.find((a: any) => a.type === 'ivrNavigation' && a.enabled);
      if (ivr) return { enabled: true, targetOption: ivr.config?.targetOption || '' };
    }
    return { enabled: false, targetOption: '' };
  }

  resolveTemplateVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
  }

  mapCallStatus(dashaStatus: string): string {
    const map: Record<string, string> = {
      Created: 'queued', Queued: 'queued', Pending: 'ringing',
      InProgress: 'in_progress', Completed: 'completed', Failed: 'failed', Canceled: 'failed',
    };
    return map[dashaStatus] || 'queued';
  }

  mapFailureReason(errorMessage: string): string {
    const upper = (errorMessage || '').toUpperCase();
    if (upper.includes('BUSY')) return 'busy';
    if (upper.includes('NO_ANSWER') || upper.includes('NOT ANSWERED')) return 'no_answer';
    if (upper.includes('DECLINED') || upper.includes('REJECTED')) return 'no_answer';
    if (upper.includes('VOICEMAIL')) return 'voicemail';
    return 'failed';
  }

  formatTranscript(transcription?: Array<{ speaker: string; text: string }>): string {
    if (!transcription?.length) return '';
    return transcription.map(t => `${t.speaker === 'assistant' ? 'Agent' : 'Customer'}: ${t.text}`).join('\n');
  }
}

export const dashaService = new DashaService();
