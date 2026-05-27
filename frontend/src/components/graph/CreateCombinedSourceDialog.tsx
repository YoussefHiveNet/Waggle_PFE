import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitMerge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSourceGroup } from "@/hooks/useSourceGroups";
import type { SourceLink, Source } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: Source[];
  links: SourceLink[];
}

export function CreateCombinedSourceDialog({ open, onOpenChange, sources, links }: Props) {
  const navigate = useNavigate();
  const createGroup = useCreateSourceGroup();

  const defaultLabel = sources.length >= 2
    ? `${sources[0].label} + ${sources[1].label}`
    : "Combined source";

  const [label, setLabel] = useState(defaultLabel);

  const sourceIds = [...new Set([
    ...links.map((l) => l.source_a_id),
    ...links.map((l) => l.source_b_id),
  ])];

  async function handleCreate() {
    try {
      const group = await createGroup.mutateAsync({
        label,
        source_ids: sourceIds,
        link_ids: links.map((l) => l.id),
        links,
      });
      onOpenChange(false);
      if (group.source?.connection_id) {
        navigate(`/chat/${group.source.connection_id}`);
      } else {
        navigate("/dashboard");
      }
    } catch {
      // toast handled inside useCreateSourceGroup
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-[var(--color-primary)]" />
            Create combined source
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="label">Name</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My combined source"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Links included ({links.length})</Label>
            <ul className="text-xs text-[var(--color-muted-foreground)] space-y-1 max-h-40 overflow-y-auto">
              {links.map((l) => (
                <li key={l.id} className="font-mono bg-[var(--color-muted)] rounded px-2 py-1">
                  {l.table_a}.{l.col_a} {l.join_type} JOIN {l.table_b} ON {l.col_a} = {l.col_b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!label.trim() || createGroup.isPending}
          >
            {createGroup.isPending ? "Creating…" : "Create & open chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
