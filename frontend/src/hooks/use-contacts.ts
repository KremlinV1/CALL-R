import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactsApi, type CreateContactData, type ContactFilters } from '@/lib/api';
import { toast } from 'sonner';

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (filters: ContactFilters) => [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
};

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: contactKeys.list(filters || {}),
    queryFn: () => contactsApi.getAll(filters),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactData) => contactsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success('Contact created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create contact');
    },
  });
}

export function useBulkCreateContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contacts: CreateContactData[]) => contactsApi.bulkCreate(contacts),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success(`${result.created} contacts imported successfully`);
      if (result.errors > 0) {
        toast.warning(`${result.errors} contacts failed to import`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import contacts');
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateContactData> }) =>
      contactsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(variables.id) });
      toast.success('Contact updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update contact');
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success('Contact deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete contact');
    },
  });
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => contactsApi.bulkDelete(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success(`${result.deleted} contacts deleted`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete contacts');
    },
  });
}
