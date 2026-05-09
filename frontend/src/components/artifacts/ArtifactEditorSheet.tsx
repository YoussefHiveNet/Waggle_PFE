import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateArtifact } from "@/hooks/useArtifacts";
import { queryService, extractError } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import type {
  Artifact, ArtifactType, StyleConfig, QueryToolResult, ToolCall,
} from "@/types";

interface Props {
  artifact: Artifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ARTIFACT_TYPES: ArtifactType[] = [
  "metric", "table", "bar", "line", "area", "pie", "scatter", "progress",
];

// Schedule string format: "every:<seconds>s" or null/empty = off.
const SCHEDULE_OPTIONS = [
  { label: "Off", value: "" },
  { label: "Every 30 seconds", value: "every:30s" },
  { label: "Every 5 minutes", value: "every:300s" },
  { label: "Every 15 minutes", value: "every:900s" },
  { label: "Every hour", value: "every:3600s" },
  { label: "Every 6 hours", value: "every:21600s" },
  { label: "Every day", value: "every:86400s" },
];

export function ArtifactEditorSheet({ artifact, open, onOpenChange }: Props) {
  const update = useUpdateArtifact();

  const [name, setName] = useState(artifact.name);
  const [question, setQuestion] = useState(artifact.question);
  const [type, setType] = useState<ArtifactType>(artifact.artifact_type);
  const [style, setStyle] = useState<StyleConfig>(artifact.style_config ?? {});
  const [schedule, setSchedule] = useState(artifact.refresh_schedule ?? "");
  const [rerunning, setRerunning] = useState(false);

  // Reset when a different artifact opens
  useEffect(() => {
    if (open) {
      setName(artifact.name);
      setQuestion(artifact.question);
      setType(artifact.artifact_type);
      setStyle(artifact.style_config ?? {});
      setSchedule(artifact.refresh_schedule ?? "");
    }
  }, [artifact.id, open]);

  const primaryColor = style.colors?.[0] ?? "#C4500A";

  function setStyleField<K extends keyof StyleConfig>(key: K, value: StyleConfig[K]) {
    setStyle((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    const questionChanged = question.trim() !== artifact.question.trim();
    let newSql = artifact.sql;

    if (questionChanged) {
      setRerunning(true);
      try {
        const res = await queryService.run(artifact.connection_id, { question });
        const tc: ToolCall | undefined = res.tool_calls[0];
        if (tc?.tool === "query" && !("error" in tc.result)) {
          newSql = (tc.result as QueryToolResult).sql;
        } else {
          toast({
            variant: "destructive",
            description: "New question didn't return a valid SQL — keeping old query.",
          });
        }
      } catch (err) {
        toast({ variant: "destructive", description: extractError(err) });
        setRerunning(false);
        return;
      }
      setRerunning(false);
    }

    update.mutate(
      {
        id: artifact.id,
        body: {
          name,
          question,
          sql: newSql,
          artifact_type: type,
          style_config: style,
          refresh_schedule: schedule || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ description: "Artifact updated" });
          onOpenChange(false);
        },
      }
    );
  }

  const saving = update.isPending || rerunning;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit artifact</SheetTitle>
          <SheetDescription>Tweak the question, look, or refresh cadence.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="query" className="flex-1 overflow-y-auto -mx-6 px-6">
          <TabsList className="w-full">
            <TabsTrigger value="query" className="flex-1">Query</TabsTrigger>
            <TabsTrigger value="style" className="flex-1">Style</TabsTrigger>
            <TabsTrigger value="schedule" className="flex-1">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="query" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="art-name">Name</Label>
              <Input id="art-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-q">Question</Label>
              <textarea
                id="art-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Saving with a new question re-runs through the validation pipeline.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Stored SQL</Label>
              <pre className="text-xs bg-[var(--color-muted)] rounded p-2 overflow-x-auto">
                {artifact.sql}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="style" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="art-type">Chart type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ArtifactType)}>
                <SelectTrigger id="art-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTIFACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="art-color">Primary color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="art-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setStyleField("colors", [e.target.value])}
                  className="h-9 w-12 rounded border border-[var(--color-border)] bg-transparent cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setStyleField("colors", [e.target.value])}
                  className="flex-1 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={style.showLegend ?? true}
                  onChange={(e) => setStyleField("showLegend", e.target.checked)}
                />
                Show legend
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={style.showGrid ?? true}
                  onChange={(e) => setStyleField("showGrid", e.target.checked)}
                />
                Show grid
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="art-prefix">Prefix</Label>
                <Input
                  id="art-prefix"
                  value={style.prefix ?? ""}
                  onChange={(e) => setStyleField("prefix", e.target.value)}
                  placeholder="$"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-suffix">Suffix</Label>
                <Input
                  id="art-suffix"
                  value={style.suffix ?? ""}
                  onChange={(e) => setStyleField("suffix", e.target.value)}
                  placeholder="%"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="art-decimals">Decimals</Label>
                <Input
                  id="art-decimals"
                  type="number"
                  min={0}
                  max={6}
                  value={style.decimals ?? 0}
                  onChange={(e) =>
                    setStyleField("decimals", Number.parseInt(e.target.value || "0", 10))
                  }
                />
              </div>
            </div>

            {type === "progress" && (
              <div className="space-y-1.5">
                <Label htmlFor="art-target">Target value</Label>
                <Input
                  id="art-target"
                  type="number"
                  value={style.target ?? ""}
                  onChange={(e) =>
                    setStyleField("target", e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="art-schedule">Auto-refresh</Label>
              <Select
                value={schedule || "__off__"}
                onValueChange={(v) => setSchedule(v === "__off__" ? "" : v)}
              >
                <SelectTrigger id="art-schedule"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || "off"} value={opt.value || "__off__"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Refreshes happen client-side while the dashboard tab is open.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
