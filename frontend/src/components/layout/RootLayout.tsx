import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { authService } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Toaster } from "@/components/shared/Toaster";

export function RootLayout() {
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const bootstrapped = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-fire
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const { access_token } = await authService.refresh();
        setToken(access_token);
        const user = await authService.me();
        setUser(user);
      } catch {
        // Not logged in — that's fine
      } finally {
        setInitialized();
      }
    })();
  }, [setToken, setUser, setInitialized]);

  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}
