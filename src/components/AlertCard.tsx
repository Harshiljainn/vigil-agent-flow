import { ChevronDown, Package } from "lucide-react";
import { useState } from "react";
import { ACTION_META, SEVERITY_META, type Alert } from "@/data/vigilai";
import {
  CategoryBadge,
  ConfidenceBar,
  GroundedBadge,
  ReversibleTag,
  SeverityDot,
  StatusPill,
  money,
  timeAgo,
} from "@/components/bits";

export function AlertCard({ alert, compact }: { alert: Alert; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="panel overflow-hidden p-4 transition-colors hover:border-primary/40"
      style={{ borderLeft: `3px solid ${SEVERITY_META[alert.severity].color}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={alert.category} />
        <SeverityDot severity={alert.severity} />
        <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
        <span className="text-xs text-muted-foreground">· {timeAgo(alert.createdAt)}</span>
        <div className="ml-auto">
          <StatusPill status={alert.status} />
        </div>
      </div>

      <h3 className="mt-2.5 text-[15px] font-medium leading-snug">{alert.summary}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ConfidenceBar value={alert.confidence} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          {alert.shipments.length} shipments · {alert.supplier}
        </span>
      </div>

      {!compact && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Evidence ({alert.evidence.length})
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <ul className="mt-2 space-y-2 rounded-lg bg-surface p-3">
              {alert.evidence.map((e, i) => (
                <li key={i} className="text-xs leading-relaxed">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-primary">{e.agent}</span>
                    <GroundedBadge grounded={e.grounded} />
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{e.text}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed Mitigation Options
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {alert.options.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-border bg-surface p-3"
                style={
                  o.id === alert.recommendedOptionId
                    ? { borderColor: "color-mix(in oklab, var(--primary) 45%, transparent)" }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{ACTION_META[o.action].label}</span>
                  <ReversibleTag action={o.action} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
                <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                  <span>{money(o.cost)}</span>
                  <span>-{o.delayReductionHours}h delay</span>
                </div>
                {o.id === alert.recommendedOptionId && (
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Recommended by StrategistAgent
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
