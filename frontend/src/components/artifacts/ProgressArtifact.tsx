import { useMemo } from "react";
import type { ArtifactProps } from "./types";

export function ProgressArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { value, target, label } = useMemo(() => {
    if (!data.length) return { value: null as number | null, target: 100, label: "" };
    const row = data[0];

    const valueKey =
      styleConfig.valueKey ?? Object.keys(row).find((k) => typeof row[k] === "number");
    const labelKey =
      styleConfig.labelKey ?? Object.keys(row).find((k) => typeof row[k] === "string");

    return {
      value: valueKey ? Number(row[valueKey] ?? 0) : null,
      target: typeof styleConfig.target === "number" ? styleConfig.target : 100,
      label: labelKey ? String(row[labelKey] ?? "") : valueKey ?? "Progress",
    };
  }, [data, styleConfig.valueKey, styleConfig.labelKey, styleConfig.target]);

  if (value === null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        No numeric value
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, (value / target) * 100));

  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 px-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-[var(--color-foreground)]">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-[var(--color-foreground)]">
          {styleConfig.prefix ?? ""}
          {value.toLocaleString()}
          {styleConfig.suffix ?? ""}
          <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">
            / {target.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="h-3 w-full rounded-full bg-[var(--color-muted)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: (styleConfig.colors ?? ["var(--color-primary)"])[0],
          }}
        />
      </div>
      <div className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
        {pct.toFixed(0)}% of target
      </div>
    </div>
  );
}
