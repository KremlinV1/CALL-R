import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callsApi, type CallFilters } from '@/lib/api';
import { toast } from 'sonner';

export const callKeys = {
  all: ['calls'] as const,
  lists: () => [...callKeys.all, 'list'] as const,
  list: (filters: CallFilters) => [...callKeys.lists(), filters] as const,
  details: () => [...callKeys.all, 'detail'] as const,
  detail: (id: string) => [...callKeys.details(), id] as const,
};

export function useCalls(filters?: CallFilters) {
  return useQuery({
    queryKey: callKeys.list(filters || {}),
    queryFn: () => callsApi.getAll(filters),
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: callKeys.detail(id),
    queryFn: () => callsApi.getById(id),
    enabled: !!id,
  });
}

export function useInitiateCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { agentId: string; toNumber: string; contactId?: string }) =>
      callsApi.initiateOutbound(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callKeys.lists() });
      toast.success('Call initiated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initiate call');
    },
  });
}

export function useEndCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => callsApi.endCall(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: callKeys.lists() });
      queryClient.invalidateQueries({ queryKey: callKeys.detail(id) });
      toast.success('Call ended');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to end call');
    },
  });
}

export function useCallTranscript(id: string) {
  return useQuery({
    queryKey: [...callKeys.detail(id), 'transcript'],
    queryFn: () => callsApi.getTranscript(id),
    enabled: !!id,
  });
}

export function useCallRecording(id: string) {
  return useQuery({
    queryKey: [...callKeys.detail(id), 'recording'],
    queryFn: () => callsApi.getRecording(id),
    enabled: !!id,
  });
}
