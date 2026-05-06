import { useMemo } from "react";
import type { ArtifactProps } from "./types";

export function TableArtifact({ data }: ArtifactProps) {
  const cols = useMemo(() => (data[0] ? Object.keys(data[0]) : []), [data]);

  if (!data.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        No rows
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--color-muted)]">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-medium text-[var(--color-foreground)] border-b border-[var(--color-border)]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className="hover:bg-[var(--color-muted)] transition-colors"
            >
              {cols.map((c) => (
                <td
                  key={c}
                  className="px-3 py-2 text-[var(--color-foreground)] border-b border-[var(--color-border)] tabular-nums"
                >
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}
