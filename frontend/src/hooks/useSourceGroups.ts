import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sourceGroupService, extractError } from "@/lib/api";
import type { SourceGroupCreateRequest } from "@/types";
import { toast } from "@/hooks/useToast";

const GROUPS_KEY = ["source-groups"] as const;
const SOURCES_KEY = ["sources"] as const;

export function useSourceGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: sourceGroupService.list,
  });
}

export function useCreateSourceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SourceGroupCreateRequest) => sourceGroupService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
      toast({ description: "Combined source created" });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useDeleteSourceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sourceGroupService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}
