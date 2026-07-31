import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

// Shared server-state hooks (dedupe + cache + stale-while-revalidate).
export const useToday = (uid: number) =>
  useQuery({ queryKey: ['today', uid], queryFn: () => api.today(uid), enabled: !!uid });

export const useStats = (uid: number) =>
  useQuery({ queryKey: ['stats', uid], queryFn: () => api.getStats(uid), enabled: !!uid });

// Invalidate the daily-progress queries after an activity (marks a block done).
export function useRefreshDay(uid: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['today', uid] });
    qc.invalidateQueries({ queryKey: ['stats', uid] });
  };
}
