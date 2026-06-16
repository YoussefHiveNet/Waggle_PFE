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
        // Skip silent-refresh on fresh visits to avoid a noisy 401 in the
        // console. We set this marker on login/register and clear it on
        // logout — so a missing marker means "no chance of being logged in".
        if (!localStorage.getItem("waggle.maybe_logged_in")) return;
        const { access_token } = await authService.refresh();
        setToken(access_token);
        const user = await authService.me();
        setUser(user);
      } catch {
        // Refresh failed — the marker is stale; clear it so we don't try again
        localStorage.removeItem("waggle.maybe_logged_in");
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
