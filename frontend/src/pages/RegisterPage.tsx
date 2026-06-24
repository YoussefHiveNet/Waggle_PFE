import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, CheckCircle2 } from "lucide-react";
import { useRegister } from "@/hooks/useRegister";
import { extractError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/useToast";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { mutate: register, isPending } = useRegister();

  const passwordLongEnough = password.length >= 8;
  const passwordsMatch    = password.length > 0 && password === confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordLongEnough) {
      toast({ variant: "destructive", description: "Password must be at least 8 characters." });
      return;
    }
    if (!passwordsMatch) {
      toast({ variant: "destructive", description: "Passwords do not match." });
      return;
    }
    register(
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
          Create your account
        </h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Start querying your data in plain English. Free to try, no credit card.
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
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pl-10"
            />
          </div>
          {password.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${
                  passwordLongEnough
                    ? "text-[var(--color-waggle-orange)]"
                    : "text-[var(--color-muted-foreground)]/40"
                }`}
              />
              <span
                className={
                  passwordLongEnough
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)]"
                }
              >
                At least 8 characters
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-sm font-medium">Confirm password</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]"
              aria-hidden
            />
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 pl-10"
            />
          </div>
          {confirm.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${
                  passwordsMatch
                    ? "text-[var(--color-waggle-orange)]"
                    : "text-[var(--color-muted-foreground)]/40"
                }`}
              />
              <span
                className={
                  passwordsMatch
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)]"
                }
              >
                Passwords match
              </span>
            </div>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-medium text-base"
          disabled={isPending}
        >
          {isPending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-xs text-[var(--color-muted-foreground)] text-center leading-relaxed">
          By creating an account you agree to use Waggle for lawful
          data analysis only.
        </p>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Already have an account?
        </span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <p className="text-center text-sm">
        <Link
          to="/login"
          className="font-semibold transition-colors hover:underline underline-offset-4"
          style={{ color: "var(--color-waggle-orange)" }}
        >
          Sign in →
        </Link>
      </p>
    </div>
  );
}
