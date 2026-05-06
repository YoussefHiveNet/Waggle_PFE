import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Database, FileText, Zap, BarChart2, ArrowRight } from "lucide-react";
import { WaggleLogo } from "@/components/shared/WaggleLogo";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Database,
    title: "Connect any source",
    description: "Postgres, MySQL, CSV, Parquet — one unified interface.",
  },
  {
    icon: Zap,
    title: "NL → SQL in seconds",
    description: "Ask in plain English. Get validated SQL and results instantly.",
  },
  {
    icon: BarChart2,
    title: "Auto-generated charts",
    description: "Tables, bars, lines, pies — Waggle picks the right visual for your data.",
  },
  {
    icon: FileText,
    title: "Semantic model",
    description: "Waggle learns what your columns mean, not just what they are.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Nav */}
      <nav className="h-14 border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0">
        <WaggleLogo />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/register">Get started</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.5 }}
        >
          <span
            className="inline-block text-sm font-semibold px-3 py-1 rounded-full mb-6"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-waggle-orange) 12%, transparent)",
              color: "var(--color-waggle-orange)",
            }}
          >
            AI-powered data exploration
          </span>
          <h1 className="text-5xl sm:text-6xl font-bold text-[var(--color-foreground)] leading-tight max-w-3xl">
            Query your data in{" "}
            <span style={{ color: "var(--color-waggle-orange)" }}>plain English</span>
          </h1>
          <p className="mt-6 text-xl text-[var(--color-muted-foreground)] max-w-xl mx-auto">
            Connect a database or upload a file. Get charts, tables, and answers — no SQL expertise needed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="gap-2 px-8">
              <Link to="/register">
                Start for free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-[var(--color-border)]">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-3xl font-bold text-center text-[var(--color-foreground)] mb-12"
          >
            Everything you need to understand your data
          </motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, title, description }, i) => (
              <motion.div
                key={title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
              >
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-waggle-orange) 12%, transparent)",
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: "var(--color-waggle-orange)" }} />
                </div>
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--color-muted-foreground)]">{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        © {new Date().getFullYear()} Waggle — PFE capstone project
      </footer>
    </div>
  );
}
