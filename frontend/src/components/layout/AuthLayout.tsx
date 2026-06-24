import { Navigate, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, BarChart3, Database, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { WaggleLogo } from "@/components/shared/WaggleLogo";
import { FullPageSpinner } from "@/components/shared/LoadingSpinner";

const features = [
  { Icon: Zap,        label: "Plain-English to SQL, in seconds" },
  { Icon: BarChart3,  label: "Auto-generated charts and dashboards" },
  { Icon: Database,   label: "Connect Postgres, CSV, Parquet, and more" },
  { Icon: Shield,     label: "Your data never leaves your stack" },
];

export function AuthLayout() {
  const { isInitialized, isAuthenticated } = useAuth();

  if (!isInitialized) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex bg-[var(--color-background)]">
      {/* ───── Left — branded marketing panel (desktop only) ───── */}
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex lg:w-[44%] relative overflow-hidden flex-col justify-between p-12"
        style={{ backgroundColor: "var(--color-waggle-orange)" }}
      >
        {/* Subtle radial / dot pattern — pure decoration */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Top — logo */}
        <div className="relative">
          <WaggleLogo light className="scale-110 origin-left" />
        </div>

        {/* Middle — pitch */}
        <div className="relative">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-[2.5rem] xl:text-5xl font-bold text-white leading-[1.1] tracking-tight"
          >
            Query your data<br />in plain English.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-white/85 text-lg leading-relaxed max-w-md"
          >
            Waggle connects to your databases and files, learns what your columns
            mean, and lets you ask questions like you would a data analyst.
          </motion.p>

          {/* Feature list */}
          <ul className="mt-10 space-y-4 max-w-md">
            {features.map(({ Icon, label }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.07 }}
                className="flex items-center gap-3 text-white"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <span className="font-medium">{label}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Bottom — small attribution */}
        <div className="relative">
          <p className="text-xs text-white/60 uppercase tracking-widest">
            Built on Hivenet · Powered by AI
          </p>
        </div>
      </motion.aside>

      {/* ───── Right — form panel ───── */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="flex flex-1 items-center justify-center p-6 sm:p-10"
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex justify-center mb-10 lg:hidden">
            <WaggleLogo />
          </div>
          <Outlet />
        </div>
      </motion.section>
    </div>
  );
}
