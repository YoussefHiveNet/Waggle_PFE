import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, ChevronDown, MessageSquareText } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtifactRenderer, ARTIFACT_TYPES } from "@/components/artifacts/ArtifactRenderer";
import { inferArtifactType } from "@/lib/artifactInfer";
import type { ArtifactType, QueryToolResult } from "@/types";
import { SaveArtifactDialog } from "./SaveArtifactDialog";

interface Props {
  result: QueryToolResult | null;
  question: string;
  connectionId: string;
  /** Last assistant turn answered without calling the query tool. */
  hasAnswerWithoutQuery?: boolean;
}

export function CurrentArtifactPanel({
  result, question, connectionId, hasAnswerWithoutQuery = false,
}: Props) {
  const [type, setType] = useState<ArtifactType>("table");
  const [showSql, setShowSql] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const inferred = useMemo<ArtifactType>(
    () => (result?.data ? inferArtifactType(result.data) : "table"),
    [result?.data]
  );

  // Reset to inferred type whenever a new result comes in
  useEffect(() => {
    setType(inferred);
  }, [inferred, result?.sql]);

  if (!result) {
    return hasAnswerWithoutQuery ? <NoQueryBanner /> : <EmptyPanel />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Latest result
          </div>
          <div className="text-sm font-medium text-[var(--color-foreground)] truncate" title={question}>
            {question}
          </div>
        </div>

        <Badge variant="success">{Math.round(result.confidence * 100)}% confidence</Badge>

        <Select value={type} onValueChange={(v) => setType(v as ArtifactType)}>
          <SelectTrigger className="h-9 w-32">
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

        <Button size="sm" onClick={() => setSaveOpen(true)} className="gap-2">
          <BookmarkPlus className="h-4 w-4" />
          Save
        </Button>
      </div>

      <div className="flex-1 p-4 overflow-hidden">
        <ArtifactRenderer type={type} data={result.data} />
      </div>

      <details
        className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/40"
        open={showSql}
        onToggle={(e) => setShowSql((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-[var(--color-muted-foreground)] flex items-center gap-1.5 select-none">
          <ChevronDown className={`h-3 w-3 transition-transform ${showSql ? "rotate-0" : "-rotate-90"}`} />
          Show SQL · {result.row_count} {result.row_count === 1 ? "row" : "rows"}
        </summary>
        <pre className="mx-4 mb-4 rounded-md bg-[var(--color-card)] p-3 text-xs overflow-auto border border-[var(--color-border)]">
          <code>{result.sql}</code>
        </pre>
      </details>

      <SaveArtifactDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        connectionId={connectionId}
        question={question}
        sql={result.sql}
        rows={result.data}
        defaultName={question}
        defaultType={type}
        styleConfig={{}}
      />
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <div className="text-sm text-[var(--color-muted-foreground)] mb-2">
          Visualizations appear here
        </div>
        <div className="text-xs text-[var(--color-muted-foreground)]/80 max-w-xs">
          Ask a question on the left. When the answer comes back, you'll see the
          data here, ready to save to your dashboard.
        </div>
      </div>
    </div>
  );
}

function NoQueryBanner() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <MessageSquareText className="h-6 w-6 mx-auto mb-3 text-[var(--color-muted-foreground)]" />
        <div className="text-sm font-medium text-[var(--color-foreground)] mb-2">
          Answered from context
        </div>
        <div className="text-xs text-[var(--color-muted-foreground)]/90">
          The assistant replied without running a database query, so there's
          nothing to visualize here. Ask a data question — e.g. "how many…",
          "total…", "by month" — to see a chart or table.
        </div>
      </div>
    </div>
  );
}
