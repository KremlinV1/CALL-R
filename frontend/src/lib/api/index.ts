export { default as apiClient } from './client';
export { authApi } from './auth';
export { agentsApi } from './agents';
export { campaignsApi } from './campaigns';
export { contactsApi } from './contacts';
export { callsApi } from './calls';
export { analyticsApi } from './analytics';

// Re-export types
export type { User, Organization, AuthResponse, LoginCredentials, RegisterData } from './auth';
export type { Agent, CreateAgentData } from './agents';
export type { Campaign, CreateCampaignData } from './campaigns';
export type { Contact, CreateContactData, ContactFilters, ContactsListResponse } from './contacts';
export type { Call, CallFilters, CallsListResponse } from './calls';
export type { DashboardStats, CallVolumeData, OutcomeData, AgentPerformance, BestTimeData, SentimentData } from './analytics';
