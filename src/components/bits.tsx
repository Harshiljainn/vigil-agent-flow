import { ArrowDownRight, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import {
  ACTION_META,
  CATEGORY_META,
  SEVERITY_META,
  type ActionType,
  type Category,
  type Severity,
  type Status,
} from "@/data/vigilai";
import { cn } from "@/lib/utils";

export function CategoryBadge({ category }: { category: Category }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: meta.color,
        backgroundColor: `color-mix(in oklab, ${meta.color} 16%, transparent)`,
        border: `1px solid color-mix(in oklab, ${meta.color} 34%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function SeverityDot({ severity, withLabel }: { severity: Severity; withLabel?: boolean }) {
  const meta = SEVERITY_META[severity];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: meta.color,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${meta.color} 22%, transparent)`,
        }}
      />
      {withLabel !== false && <span>{meta.label}</span>}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

const STATUS_STYLE: Record<Status, { label: string; color: string }> = {
  auto_executed: { label: "Auto-Executed", color: "var(--ok)" },
  pending: { label: "Pending Human Review", color: "var(--warn)" },
  rejected: { label: "Rejected", color: "var(--destructive)" },
};

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        color: s.color,
        backgroundColor: `color-mix(in oklab, ${s.color} 15%, transparent)`,
        border: `1px solid color-mix(in oklab, ${s.color} 32%, transparent)`,
      }}
    >
      {s.label}
    </span>
  );
}

export function ReversibleTag({ action }: { action: ActionType }) {
  const rev = ACTION_META[action].reversible;
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        rev ? "text-ok" : "text-destructive",
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${rev ? "var(--ok)" : "var(--destructive)"} 14%, transparent)`,
      }}
    >
      {rev ? "reversible" : "irreversible"}
    </span>
  );
}

export function GroundedBadge({ grounded }: { grounded: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        grounded ? "text-primary" : "text-muted-foreground",
      )}
      style={{
        backgroundColor: grounded
          ? "color-mix(in oklab, var(--primary) 14%, transparent)"
          : "var(--surface-2)",
      }}
    >
      {grounded ? <ShieldCheck className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {grounded ? "RAG grounded" : "live signal"}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  trend,
  hint,
}: {
  label: string;
  value: string;
  trend?: number;
  hint?: string;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {trend !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              up ? "text-ok" : "text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}

export function money(n: number) {
  return n === 0 ? "$0" : `$${n.toLocaleString("en-US")}`;
}

export function timeAgo(iso: string) {
  const diff = Date.UTC(2026, 8, 18, 9, 36) - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
