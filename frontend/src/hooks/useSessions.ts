import { useQuery } from "@tanstack/react-query";
import { sessionService } from "@/lib/api";
import type { ChatSession } from "@/types";

export function useSessions(connectionId: string) {
  return useQuery<ChatSession[]>({
    queryKey: ["sessions", connectionId],
    queryFn: () => sessionService.list(connectionId),
    enabled: !!connectionId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
