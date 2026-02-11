import apiClient from './client';

export interface Agent {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  systemPrompt: string;
  voiceProvider: string;
  voiceId: string;
  voiceSettings: Record<string, unknown>;
  llmProvider: string;
  llmModel: string;
  llmSettings: Record<string, unknown>;
  actions: Array<{ type: string; enabled: boolean; config?: Record<string, unknown> }>;
  voicemailEnabled: boolean;
  voicemailMessage: string;
  transferEnabled: boolean;
  transferDestinations: Array<{ id: string; name: string; phoneNumber: string; description?: string }>;
  totalCalls: number;
  successfulCalls: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentData {
  name: string;
  description?: string;
  systemPrompt?: string;
  voiceProvider?: string;
  voiceId?: string;
  voiceSettings?: Record<string, unknown>;
  llmProvider?: string;
  llmModel?: string;
  llmSettings?: Record<string, unknown>;
  actions?: Record<string, boolean>;
  transferConfig?: {
    enabled: boolean;
    destinations: { id: string; name: string; phoneNumber: string; description?: string }[];
    defaultDestination?: string;
  };
  voicemailConfig?: {
    detectionMessage?: string;
    leaveMessage?: boolean;
    message?: string;
  };
  smsConfig?: {
    followUpMessage?: string;
    sendAfterCall?: boolean;
  };
  emailConfig?: {
    followUpSubject?: string;
    followUpBody?: string;
    sendAfterCall?: boolean;
  };
  ivrConfig?: {
    targetOption?: string;
  };
  variables?: { id: string; name: string; csvColumn: string; defaultValue: string }[];
}

export const agentsApi = {
  getAll: async (): Promise<{ agents: Agent[] }> => {
    const { data } = await apiClient.get<{ agents: Agent[] }>('/agents');
    return data;
  },

  getById: async (id: string): Promise<{ agent: Agent }> => {
    const { data } = await apiClient.get<{ agent: Agent }>(`/agents/${id}`);
    return data;
  },

  create: async (agentData: CreateAgentData): Promise<{ agent: Agent }> => {
    const { data } = await apiClient.post<{ agent: Agent }>('/agents', agentData);
    return data;
  },

  update: async (id: string, agentData: Partial<CreateAgentData>): Promise<{ agent: Agent }> => {
    const { data } = await apiClient.put<{ agent: Agent }>(`/agents/${id}`, agentData);
    return data;
  },

  updateStatus: async (id: string, status: Agent['status']): Promise<{ agent: Agent }> => {
    const { data } = await apiClient.patch<{ agent: Agent }>(`/agents/${id}/status`, { status });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/agents/${id}`);
  },
};
