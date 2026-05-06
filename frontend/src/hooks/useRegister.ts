import { useMutation } from "@tanstack/react-query";
import { authService, extractError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { RegisterRequest } from "@/types";

export function useRegister() {
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      const { access_token } = await authService.register(body);
      setToken(access_token);
      const user = await authService.me();
      setUser(user);
    },
    onError: (err) => extractError(err),
  });
}
