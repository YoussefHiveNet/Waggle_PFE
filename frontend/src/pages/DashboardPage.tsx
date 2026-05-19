import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useSources } from "@/hooks/useSources";
import { SourceSidebar } from "@/components/dashboard/SourceSidebar";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function DashboardPage() {
  const { data: sources } = useSources();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem("waggle.selectedSource")
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sources) return;
    if (sources.length === 0) {
      setSelectedId(null);
      localStorage.removeItem("waggle.selectedSource");
      return;
    }
    if (!selectedId || !sources.some((s) => s.connection_id === selectedId)) {
      const id = sources[0].connection_id;
      setSelectedId(id);
      localStorage.setItem("waggle.selectedSource", id);
    }
  }, [sources, selectedId]);

  const selected = sources?.find((s) => s.connection_id === selectedId) ?? null;

  function handleSelect(id: string) {
    setSelectedId(id);
    localStorage.setItem("waggle.selectedSource", id);
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <SourceSidebar selectedId={selectedId} onSelect={handleSelect} />

      {/* Mobile sidebar in a Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden absolute top-[calc(var(--header-height,56px)+8px)] left-2 z-10 h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SourceSidebar selectedId={selectedId} onSelect={handleSelect} className="flex w-full border-r-0" />
        </SheetContent>
      </Sheet>

      <DashboardGrid selectedSource={selected} />
    </div>
  );
}
