import { useMemo } from "react";
import type { ArtifactProps } from "./types";

export function MetricArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { value, label } = useMemo(() => {
    if (!data.length) return { value: null as number | null, label: "" };

    const row = data[0];
    const explicit = styleConfig.valueKey;
    const numericKey =
      (explicit && typeof row[explicit] === "number" ? explicit : undefined) ??
      Object.keys(row).find((k) => typeof row[k] === "number");

    const labelKey =
      styleConfig.labelKey ??
      Object.keys(row).find((k) => typeof row[k] === "string");

    return {
      value: numericKey ? (row[numericKey] as number) : null,
      label: labelKey ? String(row[labelKey] ?? "") : numericKey ?? "",
    };
  }, [data, styleConfig.valueKey, styleConfig.labelKey]);

  if (value === null) {
    return <EmptyMetric />;
  }

  const decimals = styleConfig.decimals ?? (Number.isInteger(value) ? 0 : 2);
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center">
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
        {label}
      </div>
      <div className="text-5xl font-bold tabular-nums text-[var(--color-foreground)]">
        {styleConfig.prefix ?? ""}
        {formatted}
        {styleConfig.suffix ?? ""}
      </div>
      {styleConfig.unit && (
        <div className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {String(styleConfig.unit)}
        </div>
      )}
    </div>
  );
}

function EmptyMetric() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
      No numeric value to display
    </div>
  );
}
