import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useArtifacts } from "@/hooks/useArtifacts";
import { ArtifactCard } from "./ArtifactCard";
import type { Artifact, Source } from "@/types";

interface Props {
  selectedSource: Source | null;
}

export function DashboardGrid({ selectedSource }: Props) {
  const { data: artifacts, isLoading } = useArtifacts();

  const filtered: Artifact[] = selectedSource
    ? (artifacts ?? []).filter((a) => a.connection_id === selectedSource.connection_id)
    : (artifacts ?? []);

  return (
    <main className="flex-1 overflow-auto p-6">
      <Header selectedSource={selectedSource} />

      {isLoading ? (
        <Grid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </Grid>
      ) : filtered.length === 0 ? (
        <EmptyState selectedSource={selectedSource} />
      ) : (
        <Grid>
          {filtered.map((a) => (
            <ArtifactCard key={a.id} artifact={a} />
          ))}
        </Grid>
      )}
    </main>
  );
}

function Header({ selectedSource }: { selectedSource: Source | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          {selectedSource ? selectedSource.label : "All artifacts"}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {selectedSource
            ? `Saved questions and visualizations from ${selectedSource.label}`
            : "Pick a source on the left, or browse everything you've saved."}
        </p>
      </div>

      {selectedSource && (
        <Button onClick={() => navigate(`/chat/${selectedSource.connection_id}`)} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          New question
        </Button>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {children}
    </div>
  );
}

function EmptyState({ selectedSource }: { selectedSource: Source | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-waggle-orange) 12%, transparent)",
        }}
      >
        <Sparkles className="h-7 w-7 text-[var(--color-primary)]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-1">
        No artifacts yet
      </h2>
      <p className="text-sm text-[var(--color-muted-foreground)] max-w-sm mb-6">
        {selectedSource
          ? "Ask a question about this source and save the result as a metric, chart, or table."
          : "Add a source from the sidebar, then ask a question."}
      </p>
      {selectedSource && (
        <Button onClick={() => navigate(`/chat/${selectedSource.connection_id}`)} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Start a conversation
        </Button>
      )}
    </div>
  );
}
