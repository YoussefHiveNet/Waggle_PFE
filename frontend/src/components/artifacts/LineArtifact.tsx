import { useMemo } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { pickAxes } from "@/lib/artifactInfer";
import { ArtifactProps, DEFAULT_PALETTE } from "./types";

export function LineArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { x, y } = useMemo(() => {
    const auto = pickAxes(data);
    return {
      x: styleConfig.xAxisKey ?? auto.x,
      y: styleConfig.yAxisKey ?? auto.y,
    };
  }, [data, styleConfig.xAxisKey, styleConfig.yAxisKey]);

  if (!x || !y || !data.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Need a temporal/ordered column and one numeric column
      </div>
    );
  }

  const colors = styleConfig.colors ?? DEFAULT_PALETTE;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        {styleConfig.showGrid !== false && <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />}
        <XAxis dataKey={x} stroke="var(--color-muted-foreground)" fontSize={12} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
          }}
        />
        {styleConfig.showLegend && <Legend />}
        <Line type="monotone" dataKey={y} stroke={colors[0]} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
