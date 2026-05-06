import { useMemo } from "react";
import {
  CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { summarizeColumns } from "@/lib/artifactInfer";
import { ArtifactProps, DEFAULT_PALETTE } from "./types";

export function ScatterArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { x, y } = useMemo(() => {
    const numerics = summarizeColumns(data).filter((c) => c.kind === "numeric");
    return {
      x: styleConfig.xAxisKey ?? numerics[0]?.name,
      y: styleConfig.yAxisKey ?? numerics[1]?.name,
    };
  }, [data, styleConfig.xAxisKey, styleConfig.yAxisKey]);

  if (!x || !y || !data.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Need at least two numeric columns
      </div>
    );
  }

  const color = (styleConfig.colors ?? DEFAULT_PALETTE)[0];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        {styleConfig.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />}
        <XAxis type="number" dataKey={x} stroke="var(--color-muted-foreground)" fontSize={12} name={x} />
        <YAxis type="number" dataKey={y} stroke="var(--color-muted-foreground)" fontSize={12} name={y} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
          }}
        />
        {styleConfig.showLegend && <Legend />}
        <Scatter data={data as Record<string, unknown>[]} fill={color} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
