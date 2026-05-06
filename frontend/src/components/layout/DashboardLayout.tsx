import { Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { authService, extractError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
import { WaggleLogo } from "@/components/shared/WaggleLogo";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";

export function DashboardLayout() {
  const { user } = useAuth();
  const clearToken = useAuthStore((s) => s.clearToken);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await authService.logout();
    } catch (err) {
      toast({ variant: "destructive", description: extractError(err) });
    } finally {
      clearToken();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)]">
      {/* Top bar */}
      <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-card)] flex items-center justify-between px-6 shrink-0">
        <WaggleLogo />
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-[var(--color-muted-foreground)]">{user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </header>

      {/* Main content — pages own their own scrolling */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
