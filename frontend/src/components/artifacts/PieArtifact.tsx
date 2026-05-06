import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { pickAxes } from "@/lib/artifactInfer";
import { ArtifactProps, DEFAULT_PALETTE } from "./types";

export function PieArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { nameKey, valueKey } = useMemo(() => {
    const auto = pickAxes(data);
    return {
      nameKey: styleConfig.labelKey ?? styleConfig.xAxisKey ?? auto.x,
      valueKey: styleConfig.valueKey ?? styleConfig.yAxisKey ?? auto.y,
    };
  }, [data, styleConfig.labelKey, styleConfig.valueKey, styleConfig.xAxisKey, styleConfig.yAxisKey]);

  if (!nameKey || !valueKey || !data.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Need one categorical and one numeric column
      </div>
    );
  }

  const colors = styleConfig.colors ?? DEFAULT_PALETTE;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
          }}
        />
        {styleConfig.showLegend !== false && <Legend />}
        <Pie
          data={data as Record<string, unknown>[]}
          dataKey={valueKey}
          nameKey={nameKey}
          outerRadius="75%"
          label
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
