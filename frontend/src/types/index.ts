// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

// ── Sources ───────────────────────────────────────────────────────────────────

export type SourceType = "postgres" | "duckdb" | "bigquery";

export interface Source {
  connection_id: string;
  label: string;
  source_type: SourceType;
  created_at: string;
  // Optional metadata depending on type
  table_name?: string | null;
  original_name?: string | null;
  database?: string | null;
  host?: string | null;
}

export interface UploadResponse {
  connection_id: string;
  label: string;
  source_type: SourceType;
  table_name: string;
  row_count: number;
  column_count: number;
  columns: string[];
}

export interface ConnectRequest {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  label?: string;
}

export interface ConnectResponse {
  connection_id: string;
  label: string;
  source_type: SourceType;
  status: string;
  message: string;
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

export type ArtifactType =
  | "metric"
  | "table"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "scatter"
  | "progress";

export interface StyleConfig {
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  xAxisKey?: string;
  yAxisKey?: string;
  valueKey?: string;
  labelKey?: string;
  unit?: string;
  prefix?: string;
  suffix?: string;
  target?: number;        // for progress
  decimals?: number;
  [key: string]: unknown;
}

export interface Artifact {
  id: string;
  user_id: string;
  connection_id: string;
  name: string;
  question: string;
  sql: string;
  artifact_type: ArtifactType;
  style_config: StyleConfig;
  refresh_schedule: string | null;
  last_refreshed: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactCreateRequest {
  connection_id: string;
  name: string;
  question: string;
  sql: string;
  artifact_type: ArtifactType;
  style_config?: StyleConfig;
  refresh_schedule?: string;
}

export type ArtifactUpdateRequest = Partial<ArtifactCreateRequest>;

// ── Query / agent runtime ─────────────────────────────────────────────────────

export interface QueryRequest {
  question: string;
  session_id?: string;
}

export interface ValidationReport {
  passed: boolean;
  checks: string[];
  failures: string[];
  confidence: number;
}

/** Shape returned by run_query inside tool_calls[].result. */
export interface QueryToolResult {
  sql: string;
  data: Row[];
  row_count: number;
  validation_report: ValidationReport;
  confidence: number;
  attempts: number;
  error?: string;
}

export interface SchemaToolResult {
  tables: string[];
  context: string;
}

export interface ToolCall {
  tool: "query" | "get_schema";
  params: Record<string, unknown>;
  result: QueryToolResult | SchemaToolResult | { error: string };
}

export interface QueryResponse {
  question: string;
  response: string;
  tool_calls: ToolCall[];
  session_id: string;
  tokens_used: number;
}

export type Row = Record<string, string | number | boolean | null>;

// ── API error ─────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { msg: string; type: string }[];
}

// ── Auth store ────────────────────────────────────────────────────────────────

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  isInitialized: boolean;
}
