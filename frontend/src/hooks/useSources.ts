import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sourceService, connectService, extractError } from "@/lib/api";
import type { ConnectRequest, Source } from "@/types";
import { toast } from "@/hooks/useToast";

const SOURCES_KEY = ["sources"] as const;

export function useSources() {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: sourceService.list,
  });
}

export function useSource(id: string | undefined) {
  return useQuery({
    queryKey: ["sources", id],
    queryFn: () => sourceService.get(id!),
    enabled: !!id,
  });
}

export function useUploadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (p: number) => void }) =>
      sourceService.upload(file, onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useConnectSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConnectRequest) => connectService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useRenameSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      sourceService.rename(id, label),
    onSuccess: (updated: Source) => {
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
      qc.setQueryData(["sources", updated.connection_id], updated);
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sourceService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOURCES_KEY });
      qc.invalidateQueries({ queryKey: ["artifacts"] });
    },
    onError: (err) => toast({ variant: "destructive", description: extractError(err) }),
  });
}
