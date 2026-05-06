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
import { toast } from "@/hooks/useToast";
import type { ArtifactType, StyleConfig } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connectionId: string;
  question: string;
  sql: string;
  defaultName: string;
  defaultType: ArtifactType;
  styleConfig: StyleConfig;
}

export function SaveArtifactDialog({
  open, onOpenChange, connectionId, question, sql,
  defaultName, defaultType, styleConfig,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ArtifactType>(defaultType);
  const create = useCreateArtifact();

  async function handleSave() {
    if (!name.trim()) return;
    await create.mutateAsync({
      connection_id: connectionId,
      name: name.trim(),
      question,
      sql,
      artifact_type: type,
      style_config: styleConfig,
    });
    toast({ description: `Saved "${name}" to your dashboard` });
    onOpenChange(false);
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
