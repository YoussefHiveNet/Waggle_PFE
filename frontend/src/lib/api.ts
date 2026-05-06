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
  UploadResponse,
  QueryRequest,
  QueryResponse,
  ConnectRequest,
  ConnectResponse,
  Source,
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
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
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
  list: () => api.get<Artifact[]>("/artifacts").then((r) => r.data),

  get: (id: string) => api.get<Artifact>(`/artifacts/${id}`).then((r) => r.data),

  create: (body: ArtifactCreateRequest) =>
    api.post<Artifact>("/artifacts", body).then((r) => r.data),

  update: (id: string, body: ArtifactUpdateRequest) =>
    api.put<Artifact>(`/artifacts/${id}`, body).then((r) => r.data),

  delete: (id: string) => api.delete(`/artifacts/${id}`),
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
