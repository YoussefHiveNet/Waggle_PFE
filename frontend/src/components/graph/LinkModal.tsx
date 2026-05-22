import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { JoinType, SchemaColumn } from "@/types";

export interface PendingConnection {
  sourceId: string;
  sourceLabel: string;
  tableA: string;
  columnsA: SchemaColumn[];
  targetId: string;
  targetLabel: string;
  tableB: string;
  columnsB: SchemaColumn[];
}

interface Props {
  pending: PendingConnection | null;
  onConfirm: (colA: string, colB: string, joinType: JoinType) => void;
  onCancel: () => void;
}

export function LinkModal({ pending, onConfirm, onCancel }: Props) {
  const [colA, setColA] = useState("");
  const [colB, setColB] = useState("");
  const [joinType, setJoinType] = useState<JoinType>("LEFT");

  if (!pending) return null;

  function handleConfirm() {
    if (!colA || !colB || !pending) return;
    onConfirm(colA, colB, joinType);
    setColA("");
    setColB("");
    setJoinType("LEFT");
  }

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure join</DialogTitle>
          <DialogDescription>
            Link <strong>{pending.tableA}</strong>{" "}
            <span className="text-[var(--color-muted-foreground)]">({pending.sourceLabel})</span>
            {" → "}
            <strong>{pending.tableB}</strong>{" "}
            <span className="text-[var(--color-muted-foreground)]">({pending.targetLabel})</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Column from <strong>{pending.tableA}</strong></Label>
            <Select value={colA} onValueChange={setColA}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {pending.columnsA.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    <span className="font-mono">{c.name}</span>
                    <span className="ml-2 text-[var(--color-muted-foreground)] text-xs">
                      {c.type}{c.primary_key ? " · PK" : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Column from <strong>{pending.tableB}</strong></Label>
            <Select value={colB} onValueChange={setColB}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {pending.columnsB.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    <span className="font-mono">{c.name}</span>
                    <span className="ml-2 text-[var(--color-muted-foreground)] text-xs">
                      {c.type}{c.primary_key ? " · PK" : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Join type</Label>
            <Select value={joinType} onValueChange={(v) => setJoinType(v as JoinType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEFT">LEFT JOIN — keep all rows from {pending.tableA}</SelectItem>
                <SelectItem value="INNER">INNER JOIN — only matching rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!colA || !colB}>
            Confirm link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
