import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GripVertical, MoreHorizontal, Trash2, MessageSquare, RefreshCw, AlertCircle, Pencil, Clock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";
import { ArtifactEditorSheet } from "@/components/artifacts/ArtifactEditorSheet";
import { useDeleteArtifact, useArtifactData } from "@/hooks/useArtifacts";
import { extractError } from "@/lib/api";
import type { Artifact } from "@/types";

interface Props {
  artifact: Artifact;
  dragHandleListeners?: Record<string, unknown>;
}

// `every:Ns` → milliseconds; null/empty/invalid → null (no polling).
function parseScheduleMs(schedule: string | null): number | null {
  if (!schedule) return null;
  const m = /^every:(\d+)s$/.exec(schedule.trim());
  if (!m) return null;
  const seconds = Number.parseInt(m[1], 10);
  if (!Number.isFinite(seconds) || seconds < 5) return null;
  return seconds * 1000;
}

/**
 * Loads artifact data via the cached useArtifactData hook:
 *   - /artifacts/{id}/execute    (deterministic, raw SQL, no LLM) — primary
 *   - /query/{connection_id}     (LLM-regenerated) — fallback on 422
 * Cached for 5 min per artifact id so dashboard revisits paint instantly.
 */
export function ArtifactCard({ artifact, dragHandleListeners }: Props) {
  const navigate = useNavigate();
  const del = useDeleteArtifact();
  const [editorOpen, setEditorOpen] = useState(false);

  const { data, isLoading, error, refetch } = useArtifactData(artifact);

  // Frontend poller — fires while the dashboard tab is open. No backend cron.
  useEffect(() => {
    const ms = parseScheduleMs(artifact.refresh_schedule);
    if (!ms) return;
    const handle = window.setInterval(() => { refetch(); }, ms);
    return () => window.clearInterval(handle);
  }, [artifact.id, artifact.refresh_schedule, refetch]);

  function handleDelete() {
    if (window.confirm(`Delete "${artifact.name}"?`)) del.mutate(artifact.id);
  }

  const scheduleMs = parseScheduleMs(artifact.refresh_schedule);
  const rows = data?.data ?? null;
  const errorMsg = error ? extractError(error) : null;

  // Defensive: old cached payloads from before the backend JSONB-decode fix
  // may still have style_config / layout as strings. Parse if needed.
  const styleConfig =
    typeof artifact.style_config === "string"
      ? (() => { try { return JSON.parse(artifact.style_config as unknown as string); } catch { return {}; } })()
      : (artifact.style_config ?? {});

  return (
    <>
      <div className="group relative flex flex-col h-full w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div
            {...dragHandleListeners}
            className="flex items-center self-stretch pr-2 cursor-grab active:cursor-grabbing text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <GripVertical className="h-4 w-4 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-[var(--color-foreground)] truncate">{artifact.name}</h3>
            <p className="text-xs text-[var(--color-muted-foreground)] truncate mt-0.5">
              {artifact.question}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {scheduleMs && (
              <Clock className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            )}
            <Badge variant="secondary" className="capitalize">{artifact.artifact_type}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-[var(--color-muted)] opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditorOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(`/chat/${artifact.connection_id}`)}>
                  <MessageSquare className="h-3.5 w-3.5" /> Open chat
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 min-h-0 overflow-hidden">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : errorMsg ? (
            <ErrorBox message={errorMsg} onRetry={() => refetch()} />
          ) : rows && rows.length > 0 ? (
            <ArtifactRenderer
              type={artifact.artifact_type}
              data={rows}
              styleConfig={styleConfig}
              name={artifact.name}
            />
          ) : (
            <ErrorBox message="No rows returned" onRetry={() => refetch()} />
          )}
        </div>
      </div>

      <ArtifactEditorSheet
        artifact={artifact}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-sm">
      <AlertCircle className="h-5 w-5 text-[var(--color-destructive)]" />
      <p className="text-[var(--color-muted-foreground)] text-center px-4">{message}</p>
      <button
        onClick={onRetry}
        className="text-xs text-[var(--color-primary)] hover:underline mt-1"
      >
        Try again
      </button>
    </div>
  );
}
