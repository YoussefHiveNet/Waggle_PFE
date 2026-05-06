import { Navigate, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { WaggleLogo } from "@/components/shared/WaggleLogo";
import { FullPageSpinner } from "@/components/shared/LoadingSpinner";

export function AuthLayout() {
  const { isInitialized, isAuthenticated } = useAuth();

  if (!isInitialized) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex">
      {/* Left — Hivenet orange brand panel */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12"
        style={{ backgroundColor: "var(--color-waggle-orange)" }}
      >
        <WaggleLogo light iconOnly={false} className="mb-8 scale-150" />
        <h2 className="text-3xl font-bold text-white text-center leading-snug mt-4">
          Query your data<br />in plain English
        </h2>
        <p className="mt-4 text-white/80 text-center text-lg max-w-xs">
          Connect a database or upload a file. Get charts, tables, and answers — no SQL needed.
        </p>

        {/* Feature bullets */}
        <div className="mt-12 space-y-4 w-full max-w-xs">
          {[
            { icon: "⚡", label: "NL → SQL in seconds" },
            { icon: "📊", label: "Auto-generated visualizations" },
            { icon: "🔒", label: "Your data stays yours" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-white">
              <span className="text-xl">{icon}</span>
              <span className="font-medium">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Right — form panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-1 items-center justify-center p-8 bg-[var(--color-background)]"
      >
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <WaggleLogo />
          </div>
          <Outlet />
        </div>
      </motion.div>
    </div>
  );
}
