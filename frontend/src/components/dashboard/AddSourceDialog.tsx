import { useState, type ReactNode } from "react";
import {
  Database, Upload, Cloud, Snowflake, CreditCard,
  ShoppingBag, Sheet as SheetIcon, Users2,
} from "lucide-react";
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a data source</DialogTitle>
          <DialogDescription>
            Upload a file, connect a database, or hook into one of the integrations we're rolling out.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-4 h-auto gap-1">
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-4 w-4" /> Upload
            </TabsTrigger>
            <TabsTrigger value="postgres" className="gap-1.5">
              <Database className="h-4 w-4" /> Postgres
            </TabsTrigger>
            <TabsTrigger value="bigquery" className="gap-1.5 opacity-70">
              <Cloud className="h-4 w-4" /> BigQuery
            </TabsTrigger>
            <TabsTrigger value="snowflake" className="gap-1.5 opacity-70">
              <Snowflake className="h-4 w-4" /> Snowflake
            </TabsTrigger>
            <TabsTrigger value="stripe" className="gap-1.5 opacity-70">
              <CreditCard className="h-4 w-4" /> Stripe
            </TabsTrigger>
            <TabsTrigger value="shopify" className="gap-1.5 opacity-70">
              <ShoppingBag className="h-4 w-4" /> Shopify
            </TabsTrigger>
            <TabsTrigger value="sheets" className="gap-1.5 opacity-70">
              <SheetIcon className="h-4 w-4" /> Sheets
            </TabsTrigger>
            <TabsTrigger value="hubspot" className="gap-1.5 opacity-70">
              <Users2 className="h-4 w-4" /> HubSpot
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadTab onCreated={(id) => { onCreated?.(id); onOpenChange(false); }} />
          </TabsContent>

          <TabsContent value="postgres">
            <PostgresTab onCreated={(id) => { onCreated?.(id); onOpenChange(false); }} />
          </TabsContent>

          <TabsContent value="bigquery">
            <ComingSoonForm
              icon={<Cloud className="h-5 w-5" />}
              title="BigQuery"
              blurb="Query your Google data warehouse alongside your SMB sources."
              fields={[
                { name: "project_id", label: "Project ID",       type: "text", placeholder: "my-gcp-project" },
                { name: "dataset",    label: "Dataset",          type: "text", placeholder: "analytics" },
                { name: "location",   label: "Location",         type: "text", placeholder: "EU" },
                { name: "service_account", label: "Service account JSON", type: "file" },
              ]}
            />
          </TabsContent>

          <TabsContent value="snowflake">
            <ComingSoonForm
              icon={<Snowflake className="h-5 w-5" />}
              title="Snowflake"
              blurb="Plug into your enterprise warehouse — same chat, same dashboards."
              fields={[
                { name: "account",   label: "Account",   type: "text", placeholder: "xy12345.eu-west-1" },
                { name: "warehouse", label: "Warehouse", type: "text", placeholder: "COMPUTE_WH" },
                { name: "database",  label: "Database",  type: "text", placeholder: "ANALYTICS" },
                { name: "user",      label: "User",      type: "text" },
                { name: "password",  label: "Password",  type: "password" },
              ]}
            />
          </TabsContent>

          <TabsContent value="stripe">
            <ComingSoonForm
              icon={<CreditCard className="h-5 w-5" />}
              title="Stripe"
              blurb="Ask 'what's my MRR by city?' or 'refund rate last month?' in plain English."
              fields={[
                { name: "api_key",  label: "Secret API key", type: "password", placeholder: "sk_live_…" },
                { name: "label",    label: "Display name (optional)", type: "text", placeholder: "Stripe — production" },
              ]}
            />
          </TabsContent>

          <TabsContent value="shopify">
            <ComingSoonForm
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Shopify"
              blurb="Pull orders, customers, products — query them next to your Stripe and CRM data."
              fields={[
                { name: "shop_domain",  label: "Shop domain",     type: "text", placeholder: "yourshop.myshopify.com" },
                { name: "access_token", label: "Admin API access token", type: "password", placeholder: "shpat_…" },
              ]}
            />
          </TabsContent>

          <TabsContent value="sheets">
            <ComingSoonForm
              icon={<SheetIcon className="h-5 w-5" />}
              title="Google Sheets"
              blurb="Treat every tab as a queryable table. Where SMB finance actually lives."
              fields={[
                { name: "sheet_url",       label: "Sheet URL",            type: "text", placeholder: "https://docs.google.com/spreadsheets/…" },
                { name: "service_account", label: "Service account JSON", type: "file" },
              ]}
            />
          </TabsContent>

          <TabsContent value="hubspot">
            <ComingSoonForm
              icon={<Users2 className="h-5 w-5" />}
              title="HubSpot CRM"
              blurb="Link your contacts and deals to revenue data drawn from Stripe and Postgres."
              fields={[
                { name: "client_id",     label: "App client ID",  type: "text" },
                { name: "client_secret", label: "Client secret",  type: "password" },
                { name: "redirect_uri",  label: "Redirect URI",   type: "text", placeholder: "https://app.waggle.dev/oauth/hubspot" },
              ]}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// "Coming soon" placeholder tab — used for every integration not yet wired up.
// Fields are rendered disabled so the form looks real for demo purposes.
// ────────────────────────────────────────────────────────────────────────────

interface ComingSoonField {
  name:         string;
  label:        string;
  type:         "text" | "password" | "file";
  placeholder?: string;
}

interface ComingSoonFormProps {
  icon:   ReactNode;
  title:  string;
  blurb:  string;
  fields: ComingSoonField[];
}

function ComingSoonForm({ icon, title, blurb, fields }: ComingSoonFormProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 flex items-center gap-3">
        <span className="text-[var(--color-primary)]">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            {title}
            <span className="text-[10px] uppercase tracking-wider rounded-sm px-1.5 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold">
              Coming soon
            </span>
          </div>
          <div className="text-xs text-[var(--color-muted-foreground)] truncate">{blurb}</div>
        </div>
      </div>

      <div className="space-y-3 opacity-70 pointer-events-none">
        {fields.map((f) => (
          <div key={f.name}>
            <Label htmlFor={`cs-${f.name}`}>{f.label}</Label>
            {f.type === "file" ? (
              <Input id={`cs-${f.name}`} type="file" disabled />
            ) : (
              <Input
                id={`cs-${f.name}`}
                type={f.type}
                placeholder={f.placeholder}
                disabled
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Want early access? Reach out and we'll prioritise.
        </span>
        <Button disabled>Connect</Button>
      </div>
    </div>
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
