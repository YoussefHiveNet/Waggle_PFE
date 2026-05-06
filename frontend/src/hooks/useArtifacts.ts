import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { artifactService, extractError } from "@/lib/api";
import type { Artifact, ArtifactCreateRequest, ArtifactUpdateRequest } from "@/types";
import { toast } from "@/hooks/useToast";

const ARTIFACTS_KEY = ["artifacts"] as const;

export function useArtifacts() {
  return useQuery({
    queryKey: ARTIFACTS_KEY,
    queryFn: artifactService.list,
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
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useDeleteArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => artifactService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ARTIFACTS_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}
