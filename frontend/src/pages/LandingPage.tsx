import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Database, FileText, Zap, BarChart2, ArrowRight,
  Cloud, Snowflake, CreditCard, ShoppingBag, Sheet as SheetIcon, Users2,
} from "lucide-react";
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

const integrations = [
  { Icon: Database,    label: "Postgres" },
  { Icon: Database,    label: "DuckDB" },
  { Icon: CreditCard,  label: "Stripe" },
  { Icon: ShoppingBag, label: "Shopify" },
  { Icon: SheetIcon,   label: "Sheets" },
  { Icon: Cloud,       label: "BigQuery" },
  { Icon: Snowflake,   label: "Snowflake" },
  { Icon: Users2,      label: "HubSpot" },
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

      {/* Hero — two-column on desktop, stacked on mobile */}
      <section className="px-6 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5 }}
            className="text-center lg:text-left"
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
            <h1 className="text-5xl sm:text-6xl font-bold text-[var(--color-foreground)] leading-tight">
              Query your data in{" "}
              <span style={{ color: "var(--color-waggle-orange)" }}>plain English</span>
            </h1>
            <p className="mt-6 text-xl text-[var(--color-muted-foreground)] max-w-xl lg:max-w-none">
              Connect a database or upload a file. Get charts, tables, and answers — no SQL expertise needed.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center lg:items-start lg:justify-start justify-center gap-4">
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

          {/* Right: dashboard screenshot */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden"
              style={{
                boxShadow:
                  "0 24px 64px -16px color-mix(in srgb, var(--color-waggle-orange) 18%, transparent), 0 8px 24px -8px rgba(0,0,0,0.08)",
              }}
            >
              {/*
                TODO (Youssef): drop your dashboard screenshot at
                frontend/public/landing-dashboard.png — 1600x1000 ish, polished.
                The block below auto-falls-back to a CSS placeholder until the file exists.
              */}
              <img
                src="/landing-dashboard.png"
                alt="Waggle dashboard preview"
                className="block w-full h-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                  if (fb) fb.style.display = "flex";
                }}
              />
              {/* Placeholder shown while landing-dashboard.png is missing */}
              <div
                className="aspect-[16/10] w-full hidden items-center justify-center flex-col gap-2 text-sm text-[var(--color-muted-foreground)]"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--color-waggle-orange) 8%, transparent) 0%, transparent 60%), var(--color-muted)",
                }}
              >
                <BarChart2 className="h-12 w-12 opacity-30" />
                <span>Drop landing-dashboard.png in frontend/public/</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Problem-statement banner */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-card)] py-10 px-6">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="max-w-4xl mx-auto text-center text-xl sm:text-2xl text-[var(--color-foreground)] leading-snug"
        >
          Your data is everywhere —{" "}
          <span className="font-semibold" style={{ color: "var(--color-waggle-orange)" }}>Shopify</span>,{" "}
          <span className="font-semibold" style={{ color: "var(--color-waggle-orange)" }}>Stripe</span>,{" "}
          <span className="font-semibold" style={{ color: "var(--color-waggle-orange)" }}>Postgres</span>,{" "}
          <span className="font-semibold" style={{ color: "var(--color-waggle-orange)" }}>Sheets</span>.
          <br className="hidden sm:block" />
          Waggle brings it into one conversation.
        </motion.p>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
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

      {/* Integrations strip */}
      <section className="py-16 px-6 border-t border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="max-w-5xl mx-auto">
          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center text-xs uppercase tracking-widest text-[var(--color-muted-foreground)] mb-8"
          >
            Connectors live and shipping
          </motion.p>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6"
          >
            {integrations.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-200"
                style={{ color: "var(--color-muted-foreground)" }}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        © {new Date().getFullYear()} Waggle — PFE capstone project
      </footer>
    </div>
  );
}
