import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';

export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: () => [...analyticsKeys.all, 'dashboard'] as const,
  callVolume: (period?: string) => [...analyticsKeys.all, 'callVolume', period] as const,
  outcomes: () => [...analyticsKeys.all, 'outcomes'] as const,
  agents: () => [...analyticsKeys.all, 'agents'] as const,
  bestTimes: () => [...analyticsKeys.all, 'bestTimes'] as const,
  sentiment: () => [...analyticsKeys.all, 'sentiment'] as const,
};

export function useDashboardStats(params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn: () => analyticsApi.getDashboard(params),
  });
}

export function useCallVolume(period?: string) {
  return useQuery({
    queryKey: analyticsKeys.callVolume(period),
    queryFn: () => analyticsApi.getCallVolume(period),
  });
}

export function useOutcomes() {
  return useQuery({
    queryKey: analyticsKeys.outcomes(),
    queryFn: () => analyticsApi.getOutcomes(),
  });
}

export function useAgentPerformance() {
  return useQuery({
    queryKey: analyticsKeys.agents(),
    queryFn: () => analyticsApi.getAgentPerformance(),
  });
}

export function useBestTimes() {
  return useQuery({
    queryKey: analyticsKeys.bestTimes(),
    queryFn: () => analyticsApi.getBestTimes(),
  });
}

export function useSentiment() {
  return useQuery({
    queryKey: analyticsKeys.sentiment(),
    queryFn: () => analyticsApi.getSentiment(),
  });
}
