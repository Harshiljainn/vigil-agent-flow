import { ArrowDownRight, ArrowUpRight, Cpu, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import {
  ACTION_META,
  CATEGORY_META,
  DEMO_NOW_MS,
  SEVERITY_META,
  type ActionType,
  type Alert,
  type Category,
  type ReasoningSource,
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

const STATUS_STYLE: Record<Status, { label: string; color: string }> = {
  auto_executed: { label: "Auto-Executed", color: "var(--ok)" },
  pending: { label: "Pending Human Review", color: "var(--warn)" },
  approved: { label: "Approved", color: "var(--ok)" },
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

/** `reversible` (per option, from the backend) wins over the per-action-type default. */
export function ReversibleTag({
  action,
  reversible,
}: {
  action: ActionType;
  reversible?: boolean | undefined;
}) {
  const rev = reversible ?? ACTION_META[action].reversible;
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

/** Which backend wrote the agents' reasoning: Rule, Gemini · model, or a fallback. */
export function ReasoningBadge({ source }: { source: ReasoningSource }) {
  const gemini = source.backend === "gemini";
  const label = gemini
    ? `Gemini${source.model ? ` · ${source.model}` : ""}${source.fallback ? " (partial fallback)" : ""}`
    : source.fallback
      ? "Rule (fallback)"
      : "Rule";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        gemini ? "text-primary" : source.fallback ? "text-warn" : "text-muted-foreground",
      )}
      style={{
        backgroundColor: gemini
          ? "color-mix(in oklab, var(--primary) 14%, transparent)"
          : source.fallback
            ? "color-mix(in oklab, var(--warn) 14%, transparent)"
            : "var(--surface-2)",
      }}
      title={source.fallbackReason ? `Fallback: ${source.fallbackReason}` : undefined}
    >
      {gemini ? <Sparkles className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
      {label}
    </span>
  );
}

/** Live (real MCP signals) vs synthetic (generated scenario) alert. */
export function OriginBadge({ origin }: { origin: "live" | "synthetic" }) {
  const live = origin === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        live ? "text-ok" : "text-muted-foreground",
      )}
      style={{
        backgroundColor: live
          ? "color-mix(in oklab, var(--ok) 14%, transparent)"
          : "var(--surface-2)",
      }}
      title={
        live
          ? "Built from live Open-Meteo / GDELT signals via MCP. No ground truth; excluded from evaluation."
          : "Synthetic scenario with simulated ground truth."
      }
    >
      <Radio className="h-3 w-3" />
      {live ? "live" : "synthetic"}
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
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
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

/** Live options report the delay they cause; mock options report a delay reduction. */
export function delayLabel(o: { delayHours?: number; delayReductionHours: number }) {
  return o.delayHours !== undefined
    ? `+${o.delayHours}h delay`
    : `-${o.delayReductionHours}h delay`;
}

/** Backend data has no timestamps yet; an empty string renders as "—". */
/**
 * "5m ago". `now` defaults to the demo data's fixed time; live (backend) times pass Date.now().
 */
export function timeAgo(iso: string, now: number = DEMO_NOW_MS) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = now - t;
  if (diff < 60_000) return "just now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Age of an alert: backend alerts (they have an audit seq) use real time, demo alerts the demo clock. */
export function alertAge(alert: Pick<Alert, "createdAt" | "auditSeq">, now: number = Date.now()) {
  return timeAgo(alert.createdAt, alert.auditSeq !== undefined ? now : DEMO_NOW_MS);
}

/** Local date and time "2026-11-18 14:05" for an ISO timestamp, or "—". */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** Seconds -> "42s", "3m 05s", "2h 10m", "1d 4h"; null -> "—". */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
