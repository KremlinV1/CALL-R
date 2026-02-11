import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi, type Agent, type CreateAgentData } from '@/lib/api';
import { toast } from 'sonner';

export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters: string) => [...agentKeys.lists(), { filters }] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.lists(),
    queryFn: () => agentsApi.getAll(),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAgentData) => agentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      toast.success('Agent created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create agent');
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAgentData> }) =>
      agentsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.id) });
      toast.success('Agent updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update agent');
    },
  });
}

export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Agent['status'] }) =>
      agentsApi.updateStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(variables.id) });
      toast.success('Agent status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update agent status');
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      toast.success('Agent deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete agent');
    },
  });
}
