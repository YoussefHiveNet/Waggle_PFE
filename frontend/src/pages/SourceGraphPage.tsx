import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GitBranch, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSources } from "@/hooks/useSources";
import { useSourceLinks, useCreateSourceLink, useDeleteSourceLink, useSourceSchemas } from "@/hooks/useSourceLinks";
import { SourceGraph } from "@/components/graph/SourceGraph";
import { CreateCombinedSourceDialog } from "@/components/graph/CreateCombinedSourceDialog";
import { toast } from "@/hooks/useToast";
import type { JoinType, SchemaResponse } from "@/types";

export function SourceGraphPage() {
  const navigate = useNavigate();
  const [showCombineDialog, setShowCombineDialog] = useState(false);
  const { data: sources = [], isLoading: sourcesLoading } = useSources();
  const { data: savedLinks = [], isLoading: linksLoading } = useSourceLinks();
  const createLink = useCreateSourceLink();
  const deleteLink = useDeleteSourceLink();

  const schemaQueries = useSourceSchemas(sources.map((s) => s.connection_id));

  const schemas: Record<string, SchemaResponse> = useMemo(() => {
    const result: Record<string, SchemaResponse> = {};
    sources.forEach((src, i) => {
      const data = schemaQueries[i]?.data;
      if (data) result[src.connection_id] = data;
    });
    return result;
  }, [sources, schemaQueries]);

  const schemasLoading = schemaQueries.some((q) => q.isLoading);
  const isLoading = sourcesLoading || linksLoading || schemasLoading;

  async function handleCreateLink(
    sourceAId: string, tableA: string, colA: string,
    sourceBId: string, tableB: string, colB: string,
    joinType: JoinType,
  ) {
    try {
      await createLink.mutateAsync({
        source_a_id: sourceAId, table_a: tableA, col_a: colA,
        source_b_id: sourceBId, table_b: tableB, col_b: colB,
        join_type: joinType,
      });
      toast({ description: "Link saved." });
    } catch {
      // error toast handled inside useCreateSourceLink
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-card)] flex items-center gap-3 px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <GitBranch className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        <h1 className="text-sm font-semibold text-[var(--color-foreground)]">Source Graph</h1>
        {!isLoading && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {sources.length} source{sources.length !== 1 ? "s" : ""}
            {savedLinks.length > 0 &&
              ` · ${savedLinks.length} link${savedLinks.length !== 1 ? "s" : ""}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)] hidden sm:block">
            Drag from a table handle to link two sources
          </span>
          <Button
            size="sm"
            disabled={savedLinks.length === 0}
            onClick={() => setShowCombineDialog(true)}
          >
            <GitMerge className="h-3.5 w-3.5 mr-1.5" />
            Create combined source
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-4 p-8">
            <Skeleton className="h-48 w-64 rounded-lg" />
            <Skeleton className="h-48 w-64 rounded-lg" />
          </div>
        ) : sources.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-waggle-orange) 12%, transparent)" }}
            >
              <GitBranch className="h-7 w-7 text-[var(--color-primary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--color-foreground)]">Add at least 2 sources</p>
            <p className="text-xs text-[var(--color-muted-foreground)] max-w-xs">
              Connect a second database or upload another file to start linking sources together.
            </p>
            <Button variant="outline" className="mt-2" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        ) : (
          <SourceGraph
            sources={sources}
            schemas={schemas}
            savedLinks={savedLinks}
            onCreateLink={handleCreateLink}
            onDeleteLink={(id) => deleteLink.mutate(id)}
          />
        )}
      </div>

      <CreateCombinedSourceDialog
        open={showCombineDialog}
        onOpenChange={setShowCombineDialog}
        sources={sources}
        links={savedLinks}
      />
    </div>
  );
}
