import apiClient from './client';

export interface Contact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  status: 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted';
  tags: string[];
  customFields: Record<string, unknown>;
  totalCalls: number;
  lastCalledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactData {
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  company?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface ContactsListResponse {
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContactFilters {
  search?: string;
  status?: string;
  tags?: string;
  page?: number;
  limit?: number;
}

export const contactsApi = {
  getAll: async (filters?: ContactFilters): Promise<ContactsListResponse> => {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.tags) params.set('tags', filters.tags);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    const { data } = await apiClient.get<ContactsListResponse>(`/contacts?${params.toString()}`);
    return data;
  },

  getById: async (id: string): Promise<{ contact: Contact }> => {
    const { data } = await apiClient.get<{ contact: Contact }>(`/contacts/${id}`);
    return data;
  },

  create: async (contactData: CreateContactData): Promise<{ contact: Contact }> => {
    const { data } = await apiClient.post<{ contact: Contact }>('/contacts', contactData);
    return data;
  },

  bulkCreate: async (contacts: CreateContactData[]): Promise<{ created: number; errors: number }> => {
    const { data } = await apiClient.post<{ created: number; errors: number }>('/contacts/bulk', { contacts });
    return data;
  },

  update: async (id: string, contactData: Partial<CreateContactData>): Promise<{ contact: Contact }> => {
    const { data } = await apiClient.put<{ contact: Contact }>(`/contacts/${id}`, contactData);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/contacts/${id}`);
  },

  bulkDelete: async (ids: string[]): Promise<{ deleted: number }> => {
    const { data } = await apiClient.post<{ deleted: number }>('/contacts/bulk-delete', { ids });
    return data;
  },
};
