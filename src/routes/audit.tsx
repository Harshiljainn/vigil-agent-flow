import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CategoryBadge, PageHeading, money } from "@/components/bits";
import { ACTION_META, CATEGORY_META, type Category } from "@/data/vigilai";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — VigilAI" },
      { name: "description", content: "Every agent and human decision, with cost, confidence, approver and outcome." },
      { property: "og:title", content: "Audit Log — VigilAI" },
      { property: "og:description", content: "Full traceable history of automated and human-approved decisions." },
    ],
  }),
  component: Audit,
});

function Audit() {
  const { decisions } = useVigil();
  const [cat, setCat] = useState<Category | "all">("all");
  const [mode, setMode] = useState<"all" | "auto" | "human">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      decisions
        .filter((d) => (cat === "all" || d.category === cat) && (mode === "all" || d.mode === mode))
        .filter((d) => !q || `${d.id} ${d.alertId} ${d.human ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [decisions, cat, mode, q],
  );

  const exportCsv = () => {
    const head = "id,alert,time,category,action,mode,human,cost,confidence,status,outcome";
    const body = rows.map((d) => [d.id, d.alertId, d.timestamp, d.category, d.action, d.mode, d.human ?? "", d.cost, d.confidence, d.status, d.outcome].join(","));
    const url = URL.createObjectURL(new Blob([[head, ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "vigilai-audit.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const sel = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
  return (
    <div>
      <PageHeading
        title="Audit Log"
        subtitle={`${rows.length} of ${decisions.length} decisions · immutable record of every agent and human action`}
        actions={<button onClick={exportCsv} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Export CSV</button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or approver…" className={sel} />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} className={sel}>
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as "all")} className={sel}>
          <option value="all">Auto + Human</option><option value="auto">Auto only</option><option value="human">Human only</option>
        </select>
      </div>
      <div className="panel overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-3">Decision</th><th>Time</th><th>Category</th><th>Action</th><th>Decided by</th><th>Cost</th><th>Conf.</th><th>Status</th><th className="pr-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-border/60 hover:bg-surface-2/50">
                <td className="p-3 font-mono text-xs">{d.id}<div className="text-muted-foreground">{d.alertId}</div></td>
                <td className="font-mono text-xs text-muted-foreground">{d.timestamp.slice(0, 16).replace("T", " ")}</td>
                <td><CategoryBadge category={d.category} /></td>
                <td>{ACTION_META[d.action].label}</td>
                <td>{d.mode === "auto" ? <span className="text-primary">Agent (auto)</span> : d.human}</td>
                <td className="font-mono">{money(d.cost)}</td>
                <td className="font-mono">{d.confidence}%</td>
                <td className="capitalize">{d.status.replace("_", " ")}</td>
                <td className={`pr-3 capitalize ${d.outcome === "correct" ? "text-ok" : d.outcome === "incorrect" ? "text-destructive" : "text-muted-foreground"}`}>{d.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
