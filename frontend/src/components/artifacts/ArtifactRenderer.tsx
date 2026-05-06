import type { ArtifactType, Row, StyleConfig } from "@/types";
import { MetricArtifact } from "./MetricArtifact";
import { TableArtifact } from "./TableArtifact";
import { BarArtifact } from "./BarArtifact";
import { LineArtifact } from "./LineArtifact";
import { AreaArtifact } from "./AreaArtifact";
import { PieArtifact } from "./PieArtifact";
import { ScatterArtifact } from "./ScatterArtifact";
import { ProgressArtifact } from "./ProgressArtifact";

export interface ArtifactRendererProps {
  type: ArtifactType;
  data: Row[];
  styleConfig?: StyleConfig;
  name?: string;
}

const REGISTRY = {
  metric:   MetricArtifact,
  table:    TableArtifact,
  bar:      BarArtifact,
  line:     LineArtifact,
  area:     AreaArtifact,
  pie:      PieArtifact,
  scatter:  ScatterArtifact,
  progress: ProgressArtifact,
} as const;

export function ArtifactRenderer({ type, data, styleConfig, name }: ArtifactRendererProps) {
  const Component = REGISTRY[type];
  return <Component data={data} styleConfig={styleConfig} name={name} />;
}

export const ARTIFACT_TYPES: ArtifactType[] = [
  "metric", "table", "bar", "line", "area", "pie", "scatter", "progress",
];
