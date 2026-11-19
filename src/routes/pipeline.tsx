import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Play, ServerOff } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/bits";
import { GeminiQuota } from "@/components/GeminiQuota";
import { NodeDetail, kindIcon } from "@/components/TracePanel";
import { PIPELINE_NODES, SIGNAL_NODES, type PipelineNode } from "@/data/system";
import { api, type ApiAlertView } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fallbackNotice } from "@/lib/webrun";
import { useVigil } from "@/state/vigil";
import { toast } from "sonner";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Agent Pipeline & Reasoning Trace — VigilAI" },
      {
        name: "description",
        content:
          "Trace one alert through the VigilAI pipeline: tool-server signals, retrieved evidence, mitigation options and the Decision Gate.",
      },
      { property: "og:title", content: "Agent Pipeline & Reasoning Trace — VigilAI" },
      {
        property: "og:description",
        content: "Real backend data for a selected alert, stage by stage.",
      },
    ],
  }),
  component: Pipeline,
});

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function Pipeline() {
  const { mode, alerts, refresh, refreshLlm, canOperate } = useVigil();
  const [alertId, setAlertId] = useState<string | null>(null);
  const [view, setView] = useState<ApiAlertView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState("synthesizer");
  const [running, setRunning] = useState(false);
  const live = mode === "live";

  // Default to the newest alert once live data is in.
  useEffect(() => {
    if (live && alertId === null && alerts[0]) setAlertId(alerts[0].id);
  }, [live, alertId, alerts]);

  useEffect(() => {
    if (!live || !alertId) return;
    if (view?.alert.id === alertId) return; // already have it (e.g. just ran it)
    let cancelled = false;
    api
      .alert(alertId)
      .then((v) => {
        if (!cancelled) {
          setView(v);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [live, alertId, view]);

  const runScenario = async () => {
    setRunning(true);
    try {
      const v = await api.runScenario();
      setView(v);
      setAlertId(v.alert.id);
      setSelected("gate");
      toast.success(
        `${v.alert.id} ran through the pipeline: ${v.decision.route === "auto_execute" ? "auto-executed (simulated)" : "escalated to human review"}`,
      );
      const fb = fallbackNotice(v.reasoning);
      if (fb) toast.warning(fb);
      await refresh();
    } catch (e) {
      toast.error(`Run failed: ${errorText(e)}`);
    } finally {
      setRunning(false);
      void refreshLlm();
    }
  };

  const node = PIPELINE_NODES.find((p) => p.id === selected)!;
  const count = (n: PipelineNode): string | null => {
    if (!view) return null;
    if (n.kind === "signal") {
      const k = view.alert.signals.filter((s) => s.source === n.id).length;
      return `${k} signal${k === 1 ? "" : "s"}`;
    }
    if (n.id === "synthesizer")
      return `conf ${view.alert.confidence} · ${view.alert.evidence.length} docs`;
    if (n.id === "strategist") return `${view.options.length} options`;
    if (n.id === "gate") return view.decision.route === "auto_execute" ? "auto" : "human review";
    return null;
  };

  return (
    <div>
      <PageHeading
        title="Agent Pipeline & Reasoning Trace"
        subtitle="Three signal agents query tool servers, a Synthesizer and Strategist (Gemini, with a rule fallback if it is unavailable) reason over retrieved context, then a deterministic gate decides auto vs human."
        actions={
          live ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={alertId ?? ""}
                onChange={(e) => setAlertId(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
                aria-label="Alert to trace"
              >
                {alerts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} · {a.category} · {a.status}
                  </option>
                ))}
              </select>
              <GeminiQuota />
              <button
                onClick={() => void runScenario()}
                disabled={running || !canOperate}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {running ? "Gemini is reasoning… (can take 30 s)" : "Run new scenario"}
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="panel grid-backdrop overflow-x-auto p-5">
        <div className="flex min-w-[980px] items-center gap-4">
          <div className="grid gap-2">
            {SIGNAL_NODES.map((n) => (
              <PipelineBox
                key={n.id}
                node={n}
                sub={count(n)}
                selected={selected === n.id}
                onClick={() => setSelected(n.id)}
              />
            ))}
          </div>
          {PIPELINE_NODES.filter((n) => n.kind !== "signal").map((n) => (
            <div key={n.id} className="flex items-center gap-4">
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <PipelineBox
                node={n}
                sub={count(n)}
                selected={selected === n.id}
                onClick={() => setSelected(n.id)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {mode === "demo" ? (
          <div className="panel flex items-start gap-3 p-5">
            <ServerOff className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div>
              <p className="font-medium">No backend — no reasoning trace to show</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Traces come from the backend (GET /alerts/&#123;id&#125;) and new runs from POST
                /scenarios/run. Start the backend to trace a real alert. The stage descriptions
                above are still accurate.
              </p>
            </div>
          </div>
        ) : loadError ? (
          <div className="panel p-5 text-sm text-destructive">
            Could not load {alertId}: {loadError}
          </div>
        ) : view ? (
          <>
            {fallbackNotice(view.reasoning) && (
              <div className="panel mb-4 border-warn/50 p-4 text-sm text-warn">
                {fallbackNotice(view.reasoning)}
              </div>
            )}
            <NodeDetail node={node} view={view} />
          </>
        ) : (
          <div className="panel p-5 text-sm text-muted-foreground">Loading trace…</div>
        )}
      </div>
    </div>
  );
}

function PipelineBox({
  node,
  sub,
  selected,
  onClick,
}: {
  node: PipelineNode;
  sub: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = kindIcon(node.kind);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-[178px] rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all",
        selected && "border-primary/60",
        !node.built && "border-dashed opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate text-sm font-medium">{node.name}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {node.built ? (sub ?? (node.kind === "signal" ? "tool server" : node.kind)) : "planned"}
      </p>
    </button>
  );
}
