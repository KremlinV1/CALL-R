import apiClient from './client';

export interface Campaign {
  id: string;
  organizationId: string;
  agentId: string;
  name: string;
  description: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  scheduledStartAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  callsPerMinute: number;
  maxConcurrentCalls: number;
  voicemailAction: string;
  totalContacts: number;
  completedCalls: number;
  connectedCalls: number;
  voicemailCalls: number;
  failedCalls: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  agentId: string;
  scheduledStartAt?: string;
  callsPerMinute?: number;
  maxConcurrentCalls?: number;
  voicemailAction?: 'hangup' | 'leave_message' | 'llm_message';
}

export const campaignsApi = {
  getAll: async (): Promise<{ campaigns: Campaign[] }> => {
    const { data } = await apiClient.get<{ campaigns: Campaign[] }>('/campaigns');
    return data;
  },

  getById: async (id: string): Promise<{ campaign: Campaign }> => {
    const { data } = await apiClient.get<{ campaign: Campaign }>(`/campaigns/${id}`);
    return data;
  },

  create: async (campaignData: CreateCampaignData): Promise<{ campaign: Campaign }> => {
    const { data } = await apiClient.post<{ campaign: Campaign }>('/campaigns', campaignData);
    return data;
  },

  start: async (id: string): Promise<{ campaign: Campaign }> => {
    const { data } = await apiClient.post<{ campaign: Campaign }>(`/campaigns/${id}/start`);
    return data;
  },

  pause: async (id: string): Promise<{ campaign: Campaign }> => {
    const { data } = await apiClient.post<{ campaign: Campaign }>(`/campaigns/${id}/pause`);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/campaigns/${id}`);
  },
};
