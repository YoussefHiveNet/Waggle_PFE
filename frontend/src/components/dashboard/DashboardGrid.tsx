import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Plus, MoreHorizontal, Pencil, Trash2, Sparkles } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArtifacts, useUpdateLayout } from "@/hooks/useArtifacts";
import { useDashboards, useCreateDashboard, useRenameDashboard, useDeleteDashboard } from "@/hooks/useDashboards";
import { ArtifactCard } from "./ArtifactCard";
import type { Artifact, ArtifactLayout, Source } from "@/types";

interface Props {
  selectedSource: Source | null;
}

// Map stored layout.w → visual column span (1–3).
// New values: 4→1, 8→2, 12→3. Old RGL values (0–12 scale) also handled.
function toSpan(w: number | undefined): 1 | 2 | 3 {
  if (!w || w <= 4) return 1;
  if (w <= 8) return 2;
  return 3;
}

// Map span (1–3) → stored layout.w
function spanToW(span: 1 | 2 | 3): number {
  return span === 1 ? 4 : span === 2 ? 8 : 12;
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

  // Sort by layout.x (used as position index)
  const filtered = (connectionId
    ? artifacts.filter((a) => a.connection_id === connectionId)
    : artifacts
  ).slice().sort((a, b) => (a.layout?.x ?? 0) - (b.layout?.x ?? 0));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = filtered.findIndex((a) => a.id === active.id);
    const newIdx = filtered.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(filtered, oldIdx, newIdx);
    reordered.forEach((a, i) => {
      if ((a.layout?.x ?? 0) !== i) {
        const layout: ArtifactLayout = { ...a.layout, x: i, y: 0, w: a.layout?.w ?? 4, h: a.layout?.h ?? 3 };
        saveLayout({ id: a.id, layout });
      }
    });
  }

  function handleSpanChange(artifact: Artifact, span: 1 | 2 | 3) {
    const layout: ArtifactLayout = {
      x: artifact.layout?.x ?? 0,
      y: 0,
      w: spanToW(span),
      h: artifact.layout?.h ?? 3,
    };
    saveLayout({ id: artifact.id, layout });
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

      {selectedSource && (
        <div className="sticky top-0 z-10 bg-[var(--color-background)] flex items-stretch mb-4 border-b border-[var(--color-border)]">
          {/* Tabs — scrollable, takes remaining width */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 [scrollbar-width:none]">
            <DashboardTab label="Default" active={activeDashboardId === "__default__"} onClick={() => setActiveDashboardId("__default__")} />
            {dashboards.map((d) => (
              <div key={d.id} className="relative group flex items-center shrink-0">
                <DashboardTab label={d.name} active={activeDashboardId === d.id} onClick={() => setActiveDashboardId(d.id)} />
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
          </div>
          {/* + button — always visible, never scrolls */}
          <button
            onClick={handleCreateDashboard}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-l border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New dashboard</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState selectedSource={selectedSource} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((a) => a.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-[300px]">
              {filtered.map((a) => {
                const span = toSpan(a.layout?.w);
                return (
                  <SortableCard
                    key={a.id}
                    artifact={a}
                    span={span}
                    onSpanChange={(s) => handleSpanChange(a, s)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </main>
  );
}

function SortableCard({
  artifact, span, onSpanChange,
}: {
  artifact: Artifact;
  span: 1 | 2 | 3;
  onSpanChange: (span: 1 | 2 | 3) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: artifact.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `span ${span}`,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="min-w-0"
      {...attributes}
    >
      <ArtifactCard
        artifact={artifact}
        span={span}
        onSpanChange={onSpanChange}
        dragHandleListeners={listeners}
      />
    </div>
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
