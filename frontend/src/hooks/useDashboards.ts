import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardService } from "@/lib/api";
import type { Dashboard } from "@/types";

export function useDashboards(connectionId: string | undefined) {
  return useQuery<Dashboard[]>({
    queryKey: ["dashboards", connectionId],
    queryFn: () => connectionId ? dashboardService.list(connectionId) : Promise.resolve([]),
    enabled: !!connectionId,
  });
}

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, name }: { connectionId: string; name: string }) =>
      dashboardService.create(connectionId, name),
    onSuccess: (_, { connectionId }) => {
      qc.invalidateQueries({ queryKey: ["dashboards", connectionId] });
    },
  });
}

export function useRenameDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      dashboardService.rename(id, name),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["dashboards", data.connection_id] });
    },
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; connectionId: string }) =>
      dashboardService.delete(id),
    onSuccess: (_, { connectionId }) => {
      qc.invalidateQueries({ queryKey: ["dashboards", connectionId] });
    },
  });
}
