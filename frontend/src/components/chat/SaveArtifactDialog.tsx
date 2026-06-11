import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ARTIFACT_TYPES } from "@/components/artifacts/ArtifactRenderer";
import { useCreateArtifact } from "@/hooks/useArtifacts";
import { useDashboards } from "@/hooks/useDashboards";
import { toast } from "@/hooks/useToast";
import type { ArtifactType, Row, StyleConfig } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connectionId: string;
  question: string;
  sql: string;
  /** Optional pre-computed rows. When sql is empty (schema result), these are
   * sent as cached_data so the dashboard can render the artifact without
   * running any SQL. */
  rows?: Row[];
  defaultName: string;
  defaultType: ArtifactType;
  styleConfig: StyleConfig;
}

export function SaveArtifactDialog({
  open, onOpenChange, connectionId, question, sql, rows,
  defaultName, defaultType, styleConfig,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ArtifactType>(defaultType);
  const [dashboardId, setDashboardId] = useState<string>("__default__");
  const create = useCreateArtifact();
  const { data: dashboards = [] } = useDashboards(connectionId);

  async function handleSave() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        connection_id: connectionId,
        name: name.trim(),
        question,
        sql,
        artifact_type: type,
        style_config: styleConfig,
        dashboard_id: dashboardId === "__default__" ? null : dashboardId,
        // Static artifacts (no SQL — e.g. schema lists) carry their rows so
        // the dashboard execute endpoint can return them without hitting the DB.
        cached_data: sql ? null : rows ?? null,
      });
      toast({ description: `Saved "${name}" to your dashboard` });
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", description: "Failed to save — please try again" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save to dashboard</DialogTitle>
          <DialogDescription>
            We'll re-run the question whenever you open this artifact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="artifact-name">Name</Label>
            <Input
              id="artifact-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ArtifactType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARTIFACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="capitalize">{t}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dashboards.length > 0 && (
            <div>
              <Label>Dashboard</Label>
              <Select value={dashboardId} onValueChange={setDashboardId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default</SelectItem>
                  {dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
