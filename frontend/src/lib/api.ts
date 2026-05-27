import axios from "axios";
import { useAuthStore } from "@/store/authStore";
import type {
  TokenResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Artifact,
  ArtifactCreateRequest,
  ArtifactUpdateRequest,
  Dashboard,
  UploadResponse,
  QueryRequest,
  QueryResponse,
  ConnectRequest,
  ConnectResponse,
  Source,
  Row,
} from "@/types";

// ── Two Axios instances ───────────────────────────────────────────────────────
// authApi: no interceptors — used for auth endpoints to avoid infinite retry loop
// api:     injects Bearer token + handles 401 with silent refresh

export const authApi = axios.create({
  baseURL: "/api",
  withCredentials: true, // needed to send/receive httpOnly refresh cookie
});

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

function getStore() {
  return useAuthStore.getState();
}

// REQUEST: inject access token
api.interceptors.request.use((config) => {
  const token = getStore().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// RESPONSE: on 401 attempt one silent refresh then retry
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await authApi.post<TokenResponse>("/auth/refresh");
        getStore().setToken(data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        getStore().clearToken();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error as Error);
  }
);

// ── Helper to extract error message ──────────────────────────────────────────

export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join(", ");
  }
  return "Something went wrong";
}

// ── Auth service ──────────────────────────────────────────────────────────────

export const authService = {
  login: (body: LoginRequest) =>
    authApi.post<TokenResponse>("/auth/login", body).then((r) => r.data),

  register: (body: RegisterRequest) =>
    authApi.post<TokenResponse>("/auth/register", body).then((r) => r.data),

  refresh: () =>
    authApi.post<TokenResponse>("/auth/refresh").then((r) => r.data),

  me: () => api.get<User>("/auth/me").then((r) => r.data),

  logout: () => authApi.post("/auth/logout"),
};

// ── Artifact service ──────────────────────────────────────────────────────────

export const artifactService = {
  list: (dashboardId?: string | null) =>
    api.get<Artifact[]>("/artifacts", { params: dashboardId !== undefined ? { dashboard_id: dashboardId } : {} }).then((r) => r.data),

  get: (id: string) => api.get<Artifact>(`/artifacts/${id}`).then((r) => r.data),

  create: (body: ArtifactCreateRequest) =>
    api.post<Artifact>("/artifacts", body).then((r) => r.data),

  update: (id: string, body: ArtifactUpdateRequest) =>
    api.put<Artifact>(`/artifacts/${id}`, body).then((r) => r.data),

  delete: (id: string) => api.delete(`/artifacts/${id}`),

  execute: (id: string) =>
    api
      .post<{ data: Row[]; row_count: number; last_refreshed: string }>(`/artifacts/${id}/execute`)
      .then((r) => r.data),
};

// ── Dashboard service ─────────────────────────────────────────────────────────

export const dashboardService = {
  list: (connectionId: string) =>
    api.get<Dashboard[]>("/dashboards", { params: { connection_id: connectionId } }).then((r) => r.data),

  create: (connectionId: string, name: string) =>
    api.post<Dashboard>("/dashboards", { connection_id: connectionId, name }).then((r) => r.data),

  rename: (id: string, name: string) =>
    api.patch<Dashboard>(`/dashboards/${id}`, { name }).then((r) => r.data),

  delete: (id: string) => api.delete(`/dashboards/${id}`),
};

// ── Source service ────────────────────────────────────────────────────────────

export const sourceService = {
  list: () => api.get<Source[]>("/sources").then((r) => r.data),

  get: (id: string) => api.get<Source>(`/sources/${id}`).then((r) => r.data),

  rename: (id: string, label: string) =>
    api.patch<Source>(`/sources/${id}`, { label }).then((r) => r.data),

  delete: (id: string) => api.delete(`/sources/${id}`),

  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<UploadResponse>("/sources/upload", form, {
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((r) => r.data);
  },
};

// ── Connect service ───────────────────────────────────────────────────────────

export const connectService = {
  create: (body: ConnectRequest) =>
    api.post<ConnectResponse>("/connect", body).then((r) => r.data),
};

// ── Query service ─────────────────────────────────────────────────────────────

export const queryService = {
  run: (connectionId: string, body: QueryRequest) =>
    api.post<QueryResponse>(`/query/${connectionId}`, body).then((r) => r.data),
};

// ── Semantic service ──────────────────────────────────────────────────────────

export interface SemanticQuestion {
  id: string;
  question: string;
  field_hint?: string;
}

export type SemanticGenerateResponse =
  | { status: "needs_input"; questions: SemanticQuestion[]; message?: string }
  | { status: "ok"; model_path: string; cubes: string[]; message?: string }
  | { status: "error"; detail: string };

export const semanticService = {
  generate: (connectionId: string, business_rules?: Record<string, string>) =>
    api
      .post<SemanticGenerateResponse>(`/semantic/${connectionId}`, { business_rules })
      .then((r) => r.data),

  get: (connectionId: string) =>
    api.get(`/semantic/${connectionId}`).then((r) => r.data),
};

// ── Schema service ────────────────────────────────────────────────────────────

export const schemaService = {
  get: (connectionId: string) =>
    api.get<import("@/types").SchemaResponse>(`/schema/${connectionId}`).then((r) => r.data),
};

// ── Source link service ───────────────────────────────────────────────────────

export const sourceLinkService = {
  list: () =>
    api.get<import("@/types").SourceLink[]>("/source-links").then((r) => r.data),

  create: (body: import("@/types").SourceLinkCreateRequest) =>
    api.post<import("@/types").SourceLink>("/source-links", body).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/source-links/${id}`),
};

export const sourceGroupService = {
  list: () =>
    api.get<import("@/types").SourceGroup[]>("/source-groups").then((r) => r.data),

  create: (body: import("@/types").SourceGroupCreateRequest) =>
    api.post<import("@/types").SourceGroup>("/source-groups", body).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/source-groups/${id}`),
};
