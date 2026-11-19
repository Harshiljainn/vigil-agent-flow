import { createFileRoute } from "@tanstack/react-router";
import { Radio, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCard } from "@/components/AlertCard";
import { PageHeading, formatDateTime } from "@/components/bits";
import { CATEGORY_META, SEVERITY_META, type Category, type Severity } from "@/data/vigilai";
import { api, type ApiLiveRun } from "@/lib/api";
import { summarizeLiveRun } from "@/lib/webrun";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Live Alert Feed — VigilAI" },
      {
        name: "description",
        content:
          "Filterable feed of fused multi-agent disruption alerts with evidence, confidence and proposed mitigations.",
      },
      { property: "og:title", content: "Live Alert Feed — VigilAI" },
      {
        property: "og:description",
        content: "Multi-agent disruption alerts with RAG-grounded evidence and mitigation options.",
      },
    ],
  }),
  component: AlertFeed,
});

const selectCls =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function AlertFeed() {
  const { alerts, mode, refresh, canOperate } = useVigil();
  const [fetching, setFetching] = useState(false);
  const [lastRun, setLastRun] = useState<ApiLiveRun | null>(null);

  const fetchLive = async () => {
    setFetching(true);
    try {
      const run = await api.runLiveSignals();
      setLastRun(run);
      const s = summarizeLiveRun(run);
      if (s.cached)
        toast.info(
          `Cooldown: showing the last fetch (next real fetch in ${s.nextFetchInS ?? 0} s)`,
        );
      else if (s.failed.length)
        toast.warning(
          `${s.alertsCreated} live alert(s); failed: ${s.failed.map((f) => f.name).join(", ")}`,
        );
      else
        toast.success(
          s.allCalm ? "All monitored ports calm" : `${s.alertsCreated} live alert(s) created`,
        );
      await refresh();
    } catch (e) {
      toast.error(`Live fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFetching(false);
    }
  };
  const [category, setCategory] = useState<Category | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [q, setQ] = useState("");

  const filtered = alerts.filter(
    (a) =>
      (category === "all" || a.category === category) &&
      (severity === "all" || a.severity === severity) &&
      (q.trim() === "" ||
        `${a.summary} ${a.id} ${a.supplier} ${a.location ?? ""} ${a.origin ?? ""} ${a.shipments.join(" ")}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );

  return (
    <div>
      <PageHeading
        title="Live Alert Feed"
        subtitle="Every alert is fused from one or more signal agents, then grounded against past incidents and playbooks."
        actions={
          mode === "live" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void fetchLive()}
                disabled={fetching || !canOperate}
                title={
                  canOperate
                    ? "Call weather-mcp (Open-Meteo), news-mcp (GDELT) and supplychain-mcp (simulated) and run the alerts through the pipeline"
                    : "Log in to fetch live signals"
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Radio className="h-4 w-4" />
                {fetching
                  ? "Fetching live signals… Gemini is reasoning (up to 2 minutes)"
                  : "Fetch live signals"}
              </button>
            </div>
          ) : undefined
        }
      />

      {lastRun && <LiveRunPanel run={lastRun} />}

      <div className="panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <select
          className={selectCls}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "all")}
        >
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | "all")}
        >
          <option value="all">All severities</option>
          {(Object.keys(SEVERITY_META) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_META[s].label}
            </option>
          ))}
        </select>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search alerts, suppliers, shipment IDs…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {filtered.length}/{alerts.length}
        </span>
      </div>

      <div className="space-y-3">
        {filtered.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
        {filtered.length === 0 && (
          <p className="panel p-8 text-center text-sm text-muted-foreground">
            No alerts match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

function LiveRunPanel({ run }: { run: ApiLiveRun }) {
  const s = summarizeLiveRun(run);
  const stat = (label: string, value: string) => (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
  return (
    <div className="panel mb-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {s.cached ? "Last live fetch (cooldown)" : "Live fetch result"} ·{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {formatDateTime(run.report.checked_at)}
          </span>
        </p>
        {s.cached && (
          <p className="text-xs text-muted-foreground">
            One real fetch per 60 s: showing the last result, no new alerts. Next real fetch in{" "}
            {s.nextFetchInS ?? 0} s.
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stat("Ports checked", String(s.portsChecked))}
        {stat(
          "Ports severe",
          s.portsSevere ? `${s.portsSevere} (${s.severePorts.join(", ")})` : "0",
        )}
        {stat(
          "News fetched / kept",
          s.newsFetched === null ? "no data" : `${s.newsFetched} / ${s.newsKept}`,
        )}
        {stat("Failed servers", s.failed.length ? String(s.failed.length) : "none")}
        {stat(s.cached ? "Alerts in this result" : "Alerts created", String(s.alertsCreated))}
      </div>
      {s.failed.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-warn">
          {s.failed.map((f) => (
            <li key={f.name}>
              {f.name} failed: {f.why}
            </li>
          ))}
        </ul>
      )}
      {s.allCalm && (
        <p className="mt-3 text-sm text-muted-foreground">
          All monitored ports calm — no live alerts were created.
        </p>
      )}
      {s.geminiFallbacks.count > 0 && (
        <p className="mt-3 text-sm text-warn">
          Gemini unavailable — rule fallback for {s.geminiFallbacks.count} alert(s):{" "}
          {s.geminiFallbacks.reasons.join(", ") || "no reason given"}.
        </p>
      )}
    </div>
  );
}
