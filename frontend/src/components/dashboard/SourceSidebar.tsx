import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, FileText, MoreHorizontal, Plus, Trash2, Pencil } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSources, useDeleteSource, useRenameSource } from "@/hooks/useSources";
import { AddSourceDialog } from "./AddSourceDialog";
import type { Source } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SourceSidebar({ selectedId, onSelect }: Props) {
  const { data: sources, isLoading } = useSources();
  const [adding, setAdding] = useState(false);

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] flex flex-col">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Sources
        </h2>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-3 [scrollbar-width:thin]">
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : sources && sources.length > 0 ? (
          <ul className="space-y-0.5">
            {sources.map((s) => (
              <SourceRow
                key={s.connection_id}
                source={s}
                selected={s.connection_id === selectedId}
                onSelect={() => onSelect(s.connection_id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--color-muted-foreground)] px-3 py-6 text-center">
            No sources yet. Add one to get started.
          </p>
        )}
      </div>

      <AddSourceDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(id) => onSelect(id)}
      />
    </aside>
  );
}

function SourceRow({
  source, selected, onSelect,
}: { source: Source; selected: boolean; onSelect: () => void }) {
  const navigate = useNavigate();
  const deleteSource = useDeleteSource();
  const renameSource = useRenameSource();
  const Icon = source.source_type === "postgres" ? Database : FileText;

  function handleRename() {
    const next = window.prompt("Rename source", source.label);
    if (next && next.trim() && next !== source.label) {
      renameSource.mutate({ id: source.connection_id, label: next.trim() });
    }
  }

  function handleDelete() {
    if (window.confirm(`Delete "${source.label}"? Artifacts using it will keep their data but won't refresh.`)) {
      deleteSource.mutate(source.connection_id);
    }
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer transition-colors",
        selected
          ? "bg-[var(--color-muted)] text-[var(--color-foreground)]"
          : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
      )}
      onClick={onSelect}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
      <span className="flex-1 truncate">{source.label}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 p-1 rounded hover:bg-[var(--color-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate(`/chat/${source.connection_id}`)}>
            Open in chat
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleRename}>
            <Pencil className="h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
