import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearToken = useAuthStore((s) => s.clearToken);

  return {
    accessToken,
    user,
    isInitialized,
    isAuthenticated: accessToken !== null,
    setToken,
    setUser,
    clearToken,
  };
}
