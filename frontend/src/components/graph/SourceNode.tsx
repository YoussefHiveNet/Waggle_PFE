import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SchemaTable } from "@/types";

export interface SourceNodeData extends Record<string, unknown> {
  label: string;
  source_type: string;
  tables: Record<string, SchemaTable>;
}

// nodeTypes object — defined at module scope to keep reference stable
// (defining it inside a component causes an infinite re-render loop in @xyflow/react)
export function SourceNode({ data }: NodeProps) {
  const d = data as SourceNodeData;
  const Icon = d.source_type === "postgres" ? Database : FileText;
  const tableEntries = Object.entries(d.tables);

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] shadow-md",
        "min-w-[220px] max-w-[280px]"
      )}
      // overflow-visible is critical — handles render outside the node bounds
      style={{ overflow: "visible" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-muted)] rounded-t-lg">
        <Icon className="h-4 w-4 text-[var(--color-muted-foreground)] shrink-0" />
        <span className="text-sm font-semibold text-[var(--color-foreground)] truncate">
          {d.label}
        </span>
      </div>

      {tableEntries.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)] italic">
          Loading tables…
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {tableEntries.map(([tableName, tableData]) => (
            <div
              key={tableName}
              className="relative flex items-center px-3 py-1.5 text-xs hover:bg-[var(--color-muted)] group"
            >
              {/* Left handle — drag starts here */}
              <Handle
                type="source"
                position={Position.Left}
                id={`${tableName}__left`}
                className={cn(
                  "!w-3 !h-3 !rounded-full !border-2 !border-white",
                  "!bg-[var(--color-primary)] !opacity-0 group-hover:!opacity-100",
                  "!transition-opacity !cursor-crosshair"
                )}
                style={{ left: -6 }}
              />

              <span className="flex-1 font-medium text-[var(--color-foreground)] truncate">
                {tableName}
              </span>
              {tableData.row_count != null && (
                <span className="text-[var(--color-muted-foreground)] ml-2 shrink-0 tabular-nums">
                  {tableData.row_count.toLocaleString()}
                </span>
              )}

              {/* Right handle — drag ends here */}
              <Handle
                type="target"
                position={Position.Right}
                id={`${tableName}__right`}
                className={cn(
                  "!w-3 !h-3 !rounded-full !border-2 !border-white",
                  "!bg-[var(--color-primary)] !opacity-0 group-hover:!opacity-100",
                  "!transition-opacity !cursor-crosshair"
                )}
                style={{ right: -6 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
