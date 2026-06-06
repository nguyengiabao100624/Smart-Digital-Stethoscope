import React from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const pageMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" },
};

export const listMotion = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

export const itemMotion = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: "easeOut" } },
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      {...pageMotion}
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </motion.div>
  );
}

export function AnimatedCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className={cn("rounded-xl border border-border bg-card shadow-sm", className)}
    >
      {children}
    </motion.div>
  );
}

const badgeTone = {
  online: "border-success/20 bg-success/10 text-success",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-[#B45309]",
  error: "border-destructive/20 bg-destructive/10 text-destructive",
  info: "border-primary/20 bg-primary/10 text-primary",
  muted: "border-border bg-muted text-muted-foreground",
};

export function PulseDot({
  tone = "success",
  className,
}: {
  tone?: "success" | "warning" | "error" | "primary" | "muted";
  className?: string;
}) {
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "error"
          ? "bg-destructive"
          : tone === "primary"
            ? "bg-primary"
            : "bg-muted-foreground";

  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {tone !== "muted" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
            color,
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function StatusBadge({
  label,
  tone = "info",
  pulse = false,
}: {
  label: string;
  tone?: keyof typeof badgeTone;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        badgeTone[tone],
      )}
    >
      {pulse && (
        <PulseDot tone={tone === "error" ? "error" : tone === "warning" ? "warning" : "success"} />
      )}
      {label}
    </span>
  );
}

export function IconBadge({
  icon: Icon,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  tone?: "primary" | "secondary" | "success" | "warning" | "error" | "muted";
  className?: string;
}) {
  const toneClass =
    tone === "secondary"
      ? "bg-secondary/10 text-secondary"
      : tone === "success"
        ? "bg-success/10 text-success"
        : tone === "warning"
          ? "bg-warning/10 text-warning"
          : tone === "error"
            ? "bg-destructive/10 text-destructive"
            : tone === "muted"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary";

  return (
    <span
      className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClass, className)}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{
    title: string;
    time: string;
    description?: string;
    tone?: "success" | "warning" | "error" | "primary" | "muted";
  }>;
}) {
  return (
    <div className="relative ml-2 space-y-4 border-l border-border pl-5">
      {items.map((item) => (
        <div key={`${item.title}-${item.time}`} className="relative">
          <PulseDot
            tone={item.tone ?? "primary"}
            className="absolute -left-[25px] top-1.5 ring-4 ring-card"
          />
          <div className="text-xs text-muted-foreground">{item.time}</div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{item.title}</div>
          {item.description && (
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function WaveformPreview({ compact = false }: { compact?: boolean }) {
  const bars = [
    34, 52, 28, 64, 44, 78, 36, 58, 82, 46, 68, 32, 74, 54, 88, 42, 60, 30, 72, 50, 84, 38, 56, 66,
  ];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#334155] bg-[#0F1419] p-4",
        compact && "p-3",
      )}
    >
      <div className="mb-3 flex items-center justify-between text-xs text-[#94A3B8]">
        <span>Waveform preview</span>
        <span className="font-mono text-[#E2E8F0]">48 kHz / 16-bit</span>
      </div>
      <div className={cn("flex items-center gap-1", compact ? "h-20" : "h-32")}>
        {bars.map((height, index) => (
          <motion.span
            key={index}
            initial={{ height: 8, opacity: 0.35 }}
            animate={{ height: `${height}%`, opacity: 1 }}
            transition={{
              duration: 0.7,
              repeat: Infinity,
              repeatType: "mirror",
              delay: index * 0.035,
              ease: "easeInOut",
            }}
            className="w-full rounded-full bg-gradient-to-t from-[#00A896] to-[#0EA5E9]"
          />
        ))}
      </div>
    </div>
  );
}
