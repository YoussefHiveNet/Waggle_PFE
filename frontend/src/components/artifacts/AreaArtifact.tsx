import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { pickAxes } from "@/lib/artifactInfer";
import { ArtifactProps, DEFAULT_PALETTE } from "./types";

export function AreaArtifact({ data, styleConfig = {} }: ArtifactProps) {
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
        Need an ordered column and a numeric column
      </div>
    );
  }

  const color = (styleConfig.colors ?? DEFAULT_PALETTE)[0];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="waggle-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
        <Area type="monotone" dataKey={y} stroke={color} strokeWidth={2} fill="url(#waggle-area)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
