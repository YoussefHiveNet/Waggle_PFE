import { useMutation } from "@tanstack/react-query";
import { authService, extractError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { LoginRequest } from "@/types";

export function useLogin() {
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const { access_token } = await authService.login(body);
      setToken(access_token);
      const user = await authService.me();
      setUser(user);
    },
    onError: (err) => extractError(err),
  });
}
