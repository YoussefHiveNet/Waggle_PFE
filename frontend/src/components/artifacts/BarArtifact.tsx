import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { pickAxes } from "@/lib/artifactInfer";
import { ArtifactProps, DEFAULT_PALETTE } from "./types";

export function BarArtifact({ data, styleConfig = {} }: ArtifactProps) {
  const { x, y } = useMemo(() => {
    const auto = pickAxes(data);
    return {
      x: styleConfig.xAxisKey ?? auto.x,
      y: styleConfig.yAxisKey ?? auto.y,
    };
  }, [data, styleConfig.xAxisKey, styleConfig.yAxisKey]);

  if (!x || !y || !data.length) {
    return <EmptyChart />;
  }

  const colors = styleConfig.colors ?? DEFAULT_PALETTE;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
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
        <Bar dataKey={y} fill={colors[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
      Need one categorical and one numeric column
    </div>
  );
}
