import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreHorizontal, Trash2, MessageSquare, RefreshCw, AlertCircle, Pencil, Clock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";
import { ArtifactEditorSheet } from "@/components/artifacts/ArtifactEditorSheet";
import { useDeleteArtifact } from "@/hooks/useArtifacts";
import { queryService, extractError } from "@/lib/api";
import type { Artifact, QueryToolResult, Row, ToolCall } from "@/types";

interface Props {
  artifact: Artifact;
}

interface Status {
  rows: Row[] | null;
  loading: boolean;
  error: string | null;
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
 * Refreshes the artifact's data by re-running its underlying question through
 * /query. Going through /query keeps the validation pipeline in the loop
 * (rather than executing raw stored SQL), which protects against schema drift.
 */
export function ArtifactCard({ artifact }: Props) {
  const navigate = useNavigate();
  const del = useDeleteArtifact();
  const [status, setStatus] = useState<Status>({ rows: null, loading: true, error: null });
  const [editorOpen, setEditorOpen] = useState(false);

  async function refresh() {
    setStatus({ rows: null, loading: true, error: null });
    try {
      const res = await queryService.run(artifact.connection_id, {
        question: artifact.question,
      });
      const tc: ToolCall | undefined = res.tool_calls[0];
      if (tc?.tool === "query" && !("error" in tc.result)) {
        const r = tc.result as QueryToolResult;
        setStatus({ rows: r.data, loading: false, error: null });
      } else {
        setStatus({ rows: null, loading: false, error: "No data returned" });
      }
    } catch (err) {
      setStatus({ rows: null, loading: false, error: extractError(err) });
    }
  }

  useEffect(() => {
    refresh();
  }, [artifact.id, artifact.question]);

  // Frontend poller — fires while the dashboard tab is open. No backend cron.
  useEffect(() => {
    const ms = parseScheduleMs(artifact.refresh_schedule);
    if (!ms) return;
    const handle = window.setInterval(refresh, ms);
    return () => window.clearInterval(handle);
  }, [artifact.id, artifact.refresh_schedule]);

  function handleDelete() {
    if (window.confirm(`Delete "${artifact.name}"?`)) del.mutate(artifact.id);
  }

  const scheduleMs = parseScheduleMs(artifact.refresh_schedule);

  return (
    <>
      <div className="group relative flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
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
                <DropdownMenuItem onSelect={refresh}>
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

        <div className="flex-1 px-4 pb-4 min-h-[180px] h-[240px]">
          {status.loading ? (
            <Skeleton className="h-full w-full" />
          ) : status.error ? (
            <ErrorBox message={status.error} onRetry={refresh} />
          ) : status.rows && status.rows.length > 0 ? (
            <ArtifactRenderer
              type={artifact.artifact_type}
              data={status.rows}
              styleConfig={artifact.style_config}
              name={artifact.name}
            />
          ) : (
            <ErrorBox message="No rows returned" onRetry={refresh} />
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
