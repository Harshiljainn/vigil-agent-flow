import { createFileRoute } from "@tanstack/react-router";
import { Radio, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCard } from "@/components/AlertCard";
import { PageHeading } from "@/components/bits";
import { CATEGORY_META, SEVERITY_META, type Category, type Severity } from "@/data/vigilai";
import { api } from "@/lib/api";
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
  const { alerts, mode, health, refresh } = useVigil();
  const [fetching, setFetching] = useState(false);
  const liveSignals = health?.signals === "live";

  const fetchLive = async () => {
    setFetching(true);
    try {
      const { alerts: built, report } = await api.runLiveSignals();
      const n = report.news;
      const news = n
        ? `news: ${n.fetched} fetched, ${n.dropped_irrelevant} irrelevant, ${n.dropped_duplicate} duplicate, ${n.signals} signal(s)`
        : "news: no data";
      const failed = report.failed_servers.length
        ? ` · failed: ${report.failed_servers.join(", ")}`
        : "";
      const msg = `${built.length} live alert(s) · weather: ${report.weather_severe_ports.length}/${report.weather_ports_checked} ports severe · ${news}${failed}`;
      if (report.failed_servers.length) toast.warning(msg);
      else toast.success(msg);
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
            <button
              onClick={() => void fetchLive()}
              disabled={fetching || !liveSignals}
              title={
                liveSignals
                  ? "Call weather-mcp, news-mcp and supplychain-mcp and run the alerts through the pipeline"
                  : "Live signals are off: start the backend with VIGIL_SIGNALS=live"
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Radio className="h-4 w-4" />
              {fetching ? "Fetching…" : "Fetch live signals"}
            </button>
          ) : undefined
        }
      />

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
