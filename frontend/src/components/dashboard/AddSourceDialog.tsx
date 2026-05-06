import { useState } from "react";
import { Database, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadSource, useConnectSource } from "@/hooks/useSources";
import { toast } from "@/hooks/useToast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (connectionId: string) => void;
}

export function AddSourceDialog({ open, onOpenChange, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a data source</DialogTitle>
          <DialogDescription>
            Upload a file or connect a Postgres database to start asking questions.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" /> Upload file
            </TabsTrigger>
            <TabsTrigger value="postgres" className="gap-2">
              <Database className="h-4 w-4" /> Postgres
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadTab onCreated={(id) => { onCreated?.(id); onOpenChange(false); }} />
          </TabsContent>

          <TabsContent value="postgres">
            <PostgresTab onCreated={(id) => { onCreated?.(id); onOpenChange(false); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UploadTab({ onCreated }: { onCreated: (id: string) => void }) {
  const upload = useUploadSource();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  async function handleSubmit() {
    if (!file) return;
    const res = await upload.mutateAsync({ file, onProgress: setProgress });
    toast({ description: `Loaded ${res.row_count.toLocaleString()} rows from ${res.label}` });
    onCreated(res.connection_id);
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="file-input"
        className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--color-border)] rounded-md p-8 cursor-pointer hover:border-[var(--color-primary)] transition-colors"
      >
        <Upload className="h-8 w-8 text-[var(--color-muted-foreground)] mb-2" />
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          {file ? file.name : "Click to choose a file"}
        </span>
        <span className="text-xs text-[var(--color-muted-foreground)] mt-1">
          CSV, TSV, Parquet, JSON · up to 100&nbsp;MB
        </span>
        <input
          id="file-input"
          type="file"
          className="hidden"
          accept=".csv,.tsv,.parquet,.json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {upload.isPending && progress > 0 && (
        <div className="h-1.5 w-full rounded-full bg-[var(--color-muted)] overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={!file || upload.isPending} onClick={handleSubmit}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

function PostgresTab({ onCreated }: { onCreated: (id: string) => void }) {
  const connect = useConnectSource();
  const [form, setForm] = useState({
    host: "localhost",
    port: 5432,
    user: "",
    password: "",
    database: "",
    label: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await connect.mutateAsync({
      ...form,
      label: form.label || undefined,
    });
    toast({ description: res.message });
    onCreated(res.connection_id);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label htmlFor="host">Host</Label>
          <Input
            id="host" required value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="port">Port</Label>
          <Input
            id="port" type="number" required value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="database">Database</Label>
        <Input
          id="database" required value={form.database}
          onChange={(e) => setForm({ ...form, database: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="user">User</Label>
          <Input
            id="user" required value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="label">Display name (optional)</Label>
        <Input
          id="label" placeholder={form.database || "My database"} value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={connect.isPending}>
          {connect.isPending ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
