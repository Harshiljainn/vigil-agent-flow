import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, Info, PencilLine, X } from "lucide-react";
import { useState } from "react";
import {
  CategoryBadge,
  ConfidenceBar,
  delayLabel,
  PageHeading,
  ReasoningBadge,
  ReversibleTag,
  SeverityDot,
  alertAge,
  formatDuration,
  money,
} from "@/components/bits";
import { ACTION_META, IRREVERSIBLE_ACTIONS, type Alert } from "@/data/vigilai";
import { useVigil } from "@/state/vigil";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/queue")({
  head: () => ({
    meta: [
      { title: "Decision Queue — VigilAI" },
      {
        name: "description",
        content:
          "Human-in-the-loop queue: approve, reject or modify agent-recommended mitigations that exceeded gate thresholds.",
      },
      { property: "og:title", content: "Decision Queue — VigilAI" },
      {
        property: "og:description",
        content:
          "Approve, reject or modify escalated mitigation decisions with full cost and reversibility context.",
      },
    ],
  }),
  component: Queue,
});

function Queue() {
  const { pendingAlerts: pending, kpis, mode } = useVigil();

  return (
    <div>
      <PageHeading
        title="Decision Queue"
        subtitle="Human-in-the-loop sign-off for everything the Decision Gate refused to auto-execute."
      />

      <div className="panel mb-4 flex items-start gap-2 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          These items exceeded the current cost/confidence threshold, or involve an irreversible
          action, so they require your sign-off.
        </p>
        {mode === "live" && (
          <p className="ml-auto shrink-0 text-sm text-muted-foreground">
            Avg time to decision:{" "}
            <span className="font-mono text-foreground">
              {formatDuration(kpis.avgTimeToDecisionS)}
            </span>
            {kpis.timedReviews > 0 &&
              ` · ${kpis.timedReviews} review${kpis.timedReviews === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {pending.map((a) => (
          <QueueRow key={a.id} alert={a} />
        ))}
        {pending.length === 0 && (
          <p className="panel p-10 text-center text-sm text-muted-foreground">
            Queue clear — every open alert has been actioned.
          </p>
        )}
      </div>
    </div>
  );
}

function QueueRow({ alert }: { alert: Alert }) {
  const { approve, reject, thresholds, canReview: isReviewer, busyAlertId } = useVigil();
  const [open, setOpen] = useState(false);
  const [modify, setModify] = useState(false);
  const [chosen, setChosen] = useState(alert.recommendedOptionId);

  const recommended = alert.options.find((o) => o.id === alert.recommendedOptionId)!;
  const busy = busyAlertId === alert.id;
  const canReview = isReviewer && !busy;
  const reason = alert.gateReasons?.length
    ? alert.gateReasons.join("; ")
    : IRREVERSIBLE_ACTIONS.includes(recommended.action)
      ? `Irreversible action (${ACTION_META[recommended.action].label}) always escalates`
      : recommended.cost > thresholds.cost
        ? `Cost ${money(recommended.cost)} exceeds ${money(thresholds.cost)} threshold`
        : `Confidence ${alert.confidence}% below ${thresholds.confidence}% threshold`;

  return (
    <div className="panel p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <SeverityDot severity={alert.severity} withLabel={false} />
        <CategoryBadge category={alert.category} />
        <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
        {alert.reasoning && <ReasoningBadge source={alert.reasoning} />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{alert.summary}</span>
        <span className="hidden font-mono text-xs text-muted-foreground md:inline">
          {money(recommended.cost)} · {alert.confidence}% · {alertAge(alert)}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <p className="rounded-lg bg-warn/12 px-3 py-2 text-xs font-medium text-warn">
            Escalation reason: {reason}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <ConfidenceBar value={alert.confidence} />
            <span className="text-xs text-muted-foreground">
              {alert.shipmentCount ?? alert.shipments.length} shipments · {alert.supplier}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {alert.options.map((o) => {
              const isRec = o.id === alert.recommendedOptionId;
              const isChosen = o.id === chosen;
              return (
                <button
                  key={o.id}
                  onClick={() => modify && setChosen(o.id)}
                  className={cn(
                    "rounded-lg border border-border bg-surface p-3 text-left",
                    isChosen && "border-primary/60",
                    modify && "hover:border-primary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{ACTION_META[o.action].label}</span>
                    <ReversibleTag action={o.action} reversible={o.reversible} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
                    <span>{money(o.cost)}</span>
                    <span>{delayLabel(o)}</span>
                    {o.backendAction && <span className="break-all">{o.backendAction}</span>}
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {isRec ? "Recommended" : isChosen ? "Selected" : "Alternative"}
                  </p>
                </button>
              );
            })}
          </div>

          {modify && (
            <p className="text-xs text-muted-foreground">
              Editing mode: pick a different option above, then approve with your override.
            </p>
          )}

          {!isReviewer && (
            <p className="text-xs text-warn">
              You are logged in as an operator. Only a reviewer can approve or reject.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void approve(alert.id, chosen)}
              disabled={!canReview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ok/15 px-3 py-2 text-sm font-medium text-ok transition-colors hover:bg-ok/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Approve
            </button>
            <button
              onClick={() => void reject(alert.id)}
              disabled={!canReview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Reject
            </button>
            <button
              onClick={() => setModify((m) => !m)}
              disabled={!isReviewer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PencilLine className="h-4 w-4" /> {modify ? "Close editor" : "Modify & Approve"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
