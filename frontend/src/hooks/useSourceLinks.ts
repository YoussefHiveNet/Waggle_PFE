import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { schemaService, sourceLinkService, extractError } from "@/lib/api";
import type { SourceLink, SourceLinkCreateRequest, SchemaResponse } from "@/types";
import { toast } from "@/hooks/useToast";

const LINKS_KEY = ["source-links"] as const;

export function useSourceLinks() {
  return useQuery<SourceLink[]>({
    queryKey: LINKS_KEY,
    queryFn: sourceLinkService.list,
  });
}

export function useCreateSourceLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SourceLinkCreateRequest) => sourceLinkService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useDeleteSourceLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sourceLinkService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LINKS_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

// Parallel schema fetch for multiple sources — useQueries avoids Rules of Hooks violation
export function useSourceSchemas(connectionIds: string[]) {
  return useQueries({
    queries: connectionIds.map((id) => ({
      queryKey: ["schema", id] as const,
      queryFn: () => schemaService.get(id),
      staleTime: 5 * 60_000,
      enabled: !!id,
    })),
  });
}

// Single schema — used in isolation
export function useSourceSchema(connectionId: string | undefined) {
  return useQuery<SchemaResponse>({
    queryKey: ["schema", connectionId],
    queryFn: () => schemaService.get(connectionId!),
    enabled: !!connectionId,
    staleTime: 5 * 60_000,
  });
}
