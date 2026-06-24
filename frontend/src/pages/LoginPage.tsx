import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import { useLogin } from "@/hooks/useLogin";
import { extractError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/useToast";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { mutate: login, isPending } = useLogin();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login(
      { email, password },
      {
        onError: (err) => {
          toast({ variant: "destructive", description: extractError(err) });
        },
      }
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
          Welcome back
        </h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Sign in to continue to your Waggle workspace.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">Email</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]"
              aria-hidden
            />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">Password</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]"
              aria-hidden
            />
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pl-10"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-medium text-base"
          disabled={isPending}
        >
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          New to Waggle?
        </span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        <Link
          to="/register"
          className="font-semibold transition-colors hover:underline underline-offset-4"
          style={{ color: "var(--color-waggle-orange)" }}
        >
          Create an account →
        </Link>
      </p>
    </div>
  );
}
