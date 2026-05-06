import type { ArtifactType, Row } from "@/types";

export interface ColumnSummary {
  name: string;
  kind: "numeric" | "temporal" | "categorical" | "boolean" | "unknown";
}

const TEMPORAL_HINTS = /(date|time|month|year|day|week|created|updated|_at$)/i;

export function summarizeColumns(rows: Row[]): ColumnSummary[] {
  if (!rows.length) return [];
  const sample = rows.find((r) => r) ?? {};
  return Object.keys(sample).map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) return { name, kind: "unknown" as const };

    if (values.every((v) => typeof v === "boolean")) return { name, kind: "boolean" };
    if (values.every((v) => typeof v === "number")) return { name, kind: "numeric" };

    // Date-ish strings
    if (
      TEMPORAL_HINTS.test(name) &&
      values.every((v) => typeof v === "string" && !Number.isNaN(Date.parse(v as string)))
    ) {
      return { name, kind: "temporal" };
    }
    return { name, kind: "categorical" };
  });
}

/**
 * Pick the best artifact type given the shape of the result.
 * Heuristic, not perfect — the user can override in the artifact editor.
 */
export function inferArtifactType(rows: Row[]): ArtifactType {
  if (!rows.length) return "table";
  const cols = summarizeColumns(rows);
  const numerics = cols.filter((c) => c.kind === "numeric");
  const cats     = cols.filter((c) => c.kind === "categorical");
  const temporal = cols.filter((c) => c.kind === "temporal");

  // Single number → metric
  if (rows.length === 1 && cols.length === 1 && numerics.length === 1) return "metric";
  if (rows.length === 1 && numerics.length === 1 && cols.length <= 2) return "metric";

  // Time series → line
  if (temporal.length >= 1 && numerics.length >= 1) return "line";

  // Categorical breakdown
  if (cats.length === 1 && numerics.length === 1) {
    return rows.length <= 6 ? "pie" : "bar";
  }

  // Two numerics → scatter
  if (numerics.length >= 2 && cats.length === 0) return "scatter";

  // Default
  return "table";
}

export function pickAxes(rows: Row[]): { x?: string; y?: string } {
  const cols = summarizeColumns(rows);
  const x =
    cols.find((c) => c.kind === "temporal")?.name ??
    cols.find((c) => c.kind === "categorical")?.name;
  const y = cols.find((c) => c.kind === "numeric")?.name;
  return { x, y };
}
