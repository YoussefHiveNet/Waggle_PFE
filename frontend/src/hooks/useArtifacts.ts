import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { artifactService, queryService, extractError } from "@/lib/api";
import type {
  Artifact, ArtifactCreateRequest, ArtifactUpdateRequest, ArtifactLayout,
  QueryToolResult, ToolCall,
} from "@/types";
import { toast } from "@/hooks/useToast";

const ARTIFACTS_KEY = ["artifacts"] as const;
const dataKey = (id: string) => ["artifact-data", id] as const;

export function useArtifacts(dashboardId?: string | null) {
  return useQuery({
    queryKey: dashboardId !== undefined ? [...ARTIFACTS_KEY, dashboardId] : ARTIFACTS_KEY,
    queryFn: () => artifactService.list(dashboardId),
  });
}

export function useArtifact(id: string | undefined) {
  return useQuery({
    queryKey: ["artifacts", id],
    queryFn: () => artifactService.get(id!),
    enabled: !!id,
  });
}

export function useCreateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ArtifactCreateRequest) => artifactService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ARTIFACTS_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useUpdateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ArtifactUpdateRequest }) =>
      artifactService.update(id, body),
    onSuccess: (updated: Artifact) => {
      qc.invalidateQueries({ queryKey: ARTIFACTS_KEY });
      qc.setQueryData(["artifacts", updated.id], updated);
      qc.invalidateQueries({ queryKey: dataKey(updated.id) });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useDeleteArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => artifactService.delete(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ARTIFACTS_KEY });
      qc.removeQueries({ queryKey: dataKey(id) });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useUpdateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: ArtifactLayout }) =>
      artifactService.update(id, { layout }),
    onSuccess: (updated: Artifact) => {
      qc.setQueryData(["artifacts", updated.id], updated);
      // Patch the layout in every list cache directly — never refetch, so
      // RGL never gets a stale layout prop that would snap the card back.
      qc.setQueriesData<Artifact[]>(
        { queryKey: ["artifacts"], exact: false },
        (old) => old?.map((a) => (a.id === updated.id ? { ...a, layout: updated.layout } : a))
      );
    },
  });
}

/**
 * Fetches the artifact's data via the deterministic /execute endpoint
 * (raw SQL, no LLM). On 422 (schema drift / bad SQL) it falls back once
 * to the full /query path, which regenerates the SQL via the LLM.
 *
 * Cached for 5 minutes per artifact id — navigating away and back to
 * the dashboard within that window paints instantly with zero network.
 */
export function useArtifactData(art: Artifact) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: dataKey(art.id),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      try {
        return await artifactService.execute(art.id);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 422) {
          const res = await queryService.run(art.connection_id, { question: art.question });
          const tc: ToolCall | undefined = res.tool_calls[0];
          if (tc?.tool === "query" && !("error" in tc.result)) {
            const r = tc.result as QueryToolResult;
            qc.invalidateQueries({ queryKey: ARTIFACTS_KEY });
            return {
              data: r.data,
              row_count: r.data.length,
              last_refreshed: new Date().toISOString(),
            };
          }
        }
        throw err;
      }
    },
  });
}
