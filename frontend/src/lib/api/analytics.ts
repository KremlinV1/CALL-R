import apiClient from './client';

export interface DashboardStats {
  totalCalls: number;
  totalCallsChange: number;
  avgDurationSeconds: number;
  avgDurationChange: number;
  successRate: number;
  successRateChange: number;
  totalCostCents: number;
  costPerCall: number;
  activeCampaigns: number;
  activeAgents: number;
}

export interface CallVolumeData {
  date: string;
  calls: number;
  connected: number;
  voicemail: number;
  failed: number;
}

export interface OutcomeData {
  outcome: string;
  count: number;
  percentage: number;
}

export interface AgentPerformance {
  id: string;
  name: string;
  calls: number;
  successRate: number;
  avgDuration: number;
  revenue: number;
}

export interface BestTimeData {
  hour: number;
  day: string;
  successRate: number;
  calls: number;
}

export interface SentimentData {
  positive: number;
  neutral: number;
  negative: number;
  trend: Array<{
    date: string;
    positive: number;
    neutral: number;
    negative: number;
  }>;
}

export const analyticsApi = {
  getDashboard: async (params?: { startDate?: string; endDate?: string }): Promise<{ stats: DashboardStats }> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    
    const { data } = await apiClient.get<{ stats: DashboardStats }>(`/analytics/dashboard?${queryParams.toString()}`);
    return data;
  },

  getCallVolume: async (period?: string): Promise<{ data: CallVolumeData[] }> => {
    const { data } = await apiClient.get<{ data: CallVolumeData[] }>(`/analytics/call-volume?period=${period || '7d'}`);
    return data;
  },

  getOutcomes: async (): Promise<{ outcomes: OutcomeData[] }> => {
    const { data } = await apiClient.get<{ outcomes: OutcomeData[] }>('/analytics/outcomes');
    return data;
  },

  getAgentPerformance: async (): Promise<{ agents: AgentPerformance[] }> => {
    const { data } = await apiClient.get<{ agents: AgentPerformance[] }>('/analytics/agents');
    return data;
  },

  getBestTimes: async (): Promise<{ times: BestTimeData[] }> => {
    const { data } = await apiClient.get<{ times: BestTimeData[] }>('/analytics/best-times');
    return data;
  },

  getSentiment: async (): Promise<{ sentiment: SentimentData }> => {
    const { data } = await apiClient.get<{ sentiment: SentimentData }>('/analytics/sentiment');
    return data;
  },

  exportReport: async (params: { format?: string; startDate?: string; endDate?: string }): Promise<{ downloadUrl: string }> => {
    const queryParams = new URLSearchParams();
    if (params.format) queryParams.set('format', params.format);
    if (params.startDate) queryParams.set('startDate', params.startDate);
    if (params.endDate) queryParams.set('endDate', params.endDate);
    
    const { data } = await apiClient.get<{ downloadUrl: string; message: string }>(`/analytics/export?${queryParams.toString()}`);
    return data;
  },
};
