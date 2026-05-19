import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Plus, MoreHorizontal, Pencil, Trash2, Sparkles } from "lucide-react";
import ReactGridLayout, { type LayoutItem, type Layout, horizontalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
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

  // Reset to default tab when source changes
  useEffect(() => { setActiveDashboardId("__default__"); }, [connectionId]);

  const filtered: Artifact[] = connectionId
    ? artifacts.filter((a) => a.connection_id === connectionId)
    : artifacts;

  // Always-current ref so the debounce timer never closes over stale data
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  // Debounce layout saves.
  // saveLayout (= useMutation.mutate) is stable across renders — guaranteed by
  // TanStack Query. This makes handleLayoutChange stable too, so the debounce
  // timer is only cleared when the user actually moves/resizes, not on every
  // unrelated re-render.
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLayoutChange = useCallback((layouts: Layout) => {
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      layouts.forEach((l: LayoutItem) => {
        const art = filteredRef.current.find((a) => a.id === l.i);
        if (!art) return;
        const newLayout = { x: l.x, y: l.y, w: l.w, h: l.h };
        if (
          art.layout.x !== newLayout.x || art.layout.y !== newLayout.y ||
          art.layout.w !== newLayout.w || art.layout.h !== newLayout.h
        ) {
          saveLayout({ id: l.i, layout: newLayout });
        }
      });
    }, 800);
  }, [saveLayout]);

  const [containerWidth, setContainerWidth] = useState(0);
  // Use a state ref so the effect re-fires when the element actually mounts
  // (the div only renders after data loads, so a deps=[] effect misses it)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [containerEl]);

  const isMobile = containerWidth > 0 && containerWidth < 768;

  // Memoized so RGL never gets a new layout object reference on re-renders
  // that don't change actual data (prevents position snapping on refetches).
  // Auto-distributes items across columns when all are at the default x:0,y:0.
  const rglLayout = useMemo(() => {
    const cols = isMobile ? 1 : 12;
    const items = filtered.map((a) => ({
      i: a.id,
      x: a.layout?.x ?? 0,
      y: a.layout?.y ?? 0,
      w: isMobile ? 1 : (a.layout?.w ?? 2),
      h: a.layout?.h ?? 3,
      minW: 1,
      minH: 2,
    }));
    const allDefault = items.length > 1 && items.every((it) => it.x === 0 && it.y === 0);
    if (allDefault) {
      let col = 0, row = 0, rowH = 0;
      return items.map((it) => {
        if (col + it.w > cols) { col = 0; row += rowH; rowH = 0; }
        const result = { ...it, x: col, y: row };
        col += it.w;
        rowH = Math.max(rowH, it.h);
        return result;
      });
    }
    return items;
  }, [filtered, isMobile]);

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
        <div ref={setContainerEl} className="flex-1 min-h-0">
          {containerWidth > 0 && (
            <ReactGridLayout
              className="layout"
              layout={rglLayout}
              gridConfig={{ cols: isMobile ? 1 : 12, rowHeight: 80, margin: [16, 16] }}
              width={containerWidth}
              dragConfig={{ enabled: !isMobile, handle: ".drag-handle", bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: !isMobile, handles: ["se"] }}
              compactor={horizontalCompactor}
              onLayoutChange={handleLayoutChange}
            >
              {filtered.map((a) => (
                <div key={a.id}>
                  <ArtifactCard artifact={a} />
                </div>
              ))}
            </ReactGridLayout>
          )}
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
