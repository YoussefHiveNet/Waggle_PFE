import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Plus, MoreHorizontal, Pencil, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArtifacts, useUpdateLayout } from "@/hooks/useArtifacts";
import { useDashboards, useCreateDashboard, useRenameDashboard, useDeleteDashboard } from "@/hooks/useDashboards";
import { ArtifactCard } from "./ArtifactCard";
import type { Artifact, Source } from "@/types";

interface Props {
  selectedSource: Source | null;
}

// Map stored w value → column span (1–3).
// Old RGL values used 12-col scale; new values are 1/2/3 directly.
function toSpan(w: number | undefined): 1 | 2 | 3 {
  if (!w || w <= 1) return 1;
  if (w === 2) return 1;   // old RGL default w:2 → 1 col in 3-col grid
  if (w <= 4) return 1;
  if (w <= 8) return 2;
  return 3;
}

export function DashboardGrid({ selectedSource }: Props) {
  const connectionId = selectedSource?.connection_id;
  const [activeDashboardId, setActiveDashboardId] = useState<string | "__default__">("__default__");

  const { data: dashboards = [] } = useDashboards(connectionId);
  const { data: artifacts = [], isLoading } = useArtifacts(
    activeDashboardId === "__default__" ? "__default__" : activeDashboardId
  );
  const { mutate: saveLayout } = useUpdateLayout();
  const createDashboard = useCreateDashboard();
  const renameDashboard = useRenameDashboard();
  const deleteDashboard = useDeleteDashboard();

  useEffect(() => { setActiveDashboardId("__default__"); }, [connectionId]);

  const filtered: Artifact[] = connectionId
    ? artifacts.filter((a) => a.connection_id === connectionId)
    : artifacts;

  function handleSpanChange(artifact: Artifact, span: 1 | 2 | 3) {
    saveLayout({ id: artifact.id, layout: { x: 0, y: 0, w: span, h: artifact.layout?.h ?? 3 } });
  }

  function handleCreateDashboard() {
    if (!connectionId) return;
    const name = window.prompt("Dashboard name:");
    if (!name?.trim()) return;
    createDashboard.mutate({ connectionId, name: name.trim() });
  }

  function handleRenameDashboard(id: string, currentName: string) {
    const name = window.prompt("New name:", currentName);
    if (!name?.trim() || name === currentName) return;
    renameDashboard.mutate({ id, name: name.trim() });
  }

  function handleDeleteDashboard(id: string) {
    if (!connectionId) return;
    if (window.confirm("Delete this dashboard? Artifacts will move to Default.")) {
      deleteDashboard.mutate({ id, connectionId });
      if (activeDashboardId === id) setActiveDashboardId("__default__");
    }
  }

  return (
    <main className="flex-1 overflow-auto p-3 sm:p-6 flex flex-col min-h-0">
      <Header selectedSource={selectedSource} />

      {/* Dashboard tab bar */}
      {selectedSource && (
        <div className="flex items-center gap-1 mb-4 border-b border-[var(--color-border)] overflow-x-auto pb-0 [scrollbar-width:none]">
          <DashboardTab
            label="Default"
            active={activeDashboardId === "__default__"}
            onClick={() => setActiveDashboardId("__default__")}
          />
          {dashboards.map((d) => (
            <div key={d.id} className="relative group flex items-center">
              <DashboardTab
                label={d.name}
                active={activeDashboardId === d.id}
                onClick={() => setActiveDashboardId(d.id)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-muted)]">
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => handleRenameDashboard(d.id, d.name)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => handleDeleteDashboard(d.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          <button
            onClick={handleCreateDashboard}
            className="flex items-center gap-1 px-2 py-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState selectedSource={selectedSource} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-[300px]">
          {filtered.map((a) => {
            const span = toSpan(a.layout?.w);
            return (
              <div
                key={a.id}
                style={{ gridColumn: `span ${span}` }}
                className="min-w-0"
              >
                <ArtifactCard
                  artifact={a}
                  span={span}
                  onSpanChange={(s) => handleSpanChange(a, s)}
                />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function DashboardTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
        active
          ? "border-[var(--color-primary)] text-[var(--color-foreground)] font-medium"
          : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      }`}
    >
      {label}
    </button>
  );
}

function Header({ selectedSource }: { selectedSource: Source | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)]">
          {selectedSource ? selectedSource.label : "All artifacts"}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          {selectedSource
            ? `Saved visualizations for ${selectedSource.label}`
            : "Pick a source on the left to begin."}
        </p>
      </div>
      {selectedSource && (
        <Button onClick={() => navigate(`/chat/${selectedSource.connection_id}`)} className="gap-2 shrink-0">
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">New question</span>
        </Button>
      )}
    </div>
  );
}

function EmptyState({ selectedSource }: { selectedSource: Source | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-waggle-orange) 12%, transparent)" }}
      >
        <Sparkles className="h-7 w-7 text-[var(--color-primary)]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-1">No artifacts yet</h2>
      <p className="text-sm text-[var(--color-muted-foreground)] max-w-sm mb-6">
        {selectedSource
          ? "Ask a question and save the result as a metric, chart, or table."
          : "Add a source from the sidebar, then ask a question."}
      </p>
      {selectedSource && (
        <Button onClick={() => navigate(`/chat/${selectedSource.connection_id}`)} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Start a conversation
        </Button>
      )}
    </div>
  );
}
