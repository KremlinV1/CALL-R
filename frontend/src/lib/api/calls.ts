import apiClient from './client';

export interface Call {
  id: string;
  organizationId: string;
  agentId: string;
  campaignId: string | null;
  contactId: string | null;
  direction: 'inbound' | 'outbound';
  status: 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'voicemail' | 'busy' | 'no_answer';
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  outcome: string | null;
  qualityScore: number | null;
  costCents: number;
  createdAt: string;
}

export interface CallFilters {
  agentId?: string;
  campaignId?: string;
  status?: string;
  direction?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface CallsListResponse {
  calls: Call[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const callsApi = {
  getAll: async (filters?: CallFilters): Promise<CallsListResponse> => {
    const params = new URLSearchParams();
    if (filters?.agentId) params.set('agentId', filters.agentId);
    if (filters?.campaignId) params.set('campaignId', filters.campaignId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.direction) params.set('direction', filters.direction);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    const { data } = await apiClient.get<CallsListResponse>(`/calls?${params.toString()}`);
    return data;
  },

  getById: async (id: string): Promise<{ call: Call }> => {
    const { data } = await apiClient.get<{ call: Call }>(`/calls/${id}`);
    return data;
  },

  initiateOutbound: async (params: { agentId: string; toNumber: string; contactId?: string }): Promise<{ call: Call }> => {
    const { data } = await apiClient.post<{ call: Call }>('/calls/outbound', params);
    return data;
  },

  endCall: async (id: string): Promise<{ call: Call }> => {
    const { data } = await apiClient.post<{ call: Call }>(`/calls/${id}/end`);
    return data;
  },

  getTranscript: async (id: string): Promise<{ transcript: string | null }> => {
    const { data } = await apiClient.get<{ transcript: string | null }>(`/calls/${id}/transcript`);
    return data;
  },

  getRecording: async (id: string): Promise<{ recordingUrl: string }> => {
    const { data } = await apiClient.get<{ recordingUrl: string }>(`/calls/${id}/recording`);
    return data;
  },
};
