import type { Row, StyleConfig } from "@/types";

export interface ArtifactProps {
  data: Row[];
  styleConfig?: StyleConfig;
  name?: string;
}

export const DEFAULT_PALETTE = [
  "#E8610A", // waggle orange
  "#0E7490", // teal-700
  "#7C3AED", // violet-600
  "#D97706", // amber-600
  "#16A34A", // green-600
  "#DC2626", // red-600
  "#0891B2", // cyan-600
  "#EA580C", // orange-600
];
