import { useEffect, useState } from "react";
import { useSources } from "@/hooks/useSources";
import { SourceSidebar } from "@/components/dashboard/SourceSidebar";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

export function DashboardPage() {
  const { data: sources } = useSources();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select the first source on load (and clear selection if it's deleted)
  useEffect(() => {
    if (!sources) return;
    if (sources.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !sources.some((s) => s.connection_id === selectedId)) {
      setSelectedId(sources[0].connection_id);
    }
  }, [sources, selectedId]);

  const selected = sources?.find((s) => s.connection_id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <SourceSidebar selectedId={selectedId} onSelect={setSelectedId} />
      <DashboardGrid selectedSource={selected} />
    </div>
  );
}
