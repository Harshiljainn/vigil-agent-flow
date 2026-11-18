import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CategoryBadge,
  PageHeading,
  ReasoningBadge,
  formatDateTime,
  formatDuration,
  money,
} from "@/components/bits";
import { ACTION_META, CATEGORY_META, type Category, type Decision } from "@/data/vigilai";
import { inDateRange, reasoningLabel, sortDecisions, type AuditSortKey } from "@/lib/adapter";
import { api, type ApiAuditVerify } from "@/lib/api";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — VigilAI" },
      {
        name: "description",
        content: "Every agent and human decision, with cost, confidence, approver and outcome.",
      },
      { property: "og:title", content: "Audit Log — VigilAI" },
      {
        property: "og:description",
        content: "Full traceable history of automated and human-approved decisions.",
      },
    ],
  }),
  component: Audit,
});

type Status = Decision["status"];
const STATUSES: { value: Status; label: string }[] = [
  { value: "auto_executed", label: "Auto executed" },
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const COLUMNS: { key: AuditSortKey | null; label: string; className?: string }[] = [
  { key: "id", label: "Decision", className: "p-3" },
  { key: null, label: "Time" },
  { key: "category", label: "Category" },
  { key: "action", label: "Action" },
  { key: null, label: "Reasoning" },
  { key: "route", label: "Route" },
  { key: "human", label: "Decided by" },
  { key: "cost", label: "Cost" },
  { key: "confidence", label: "Conf." },
  { key: "status", label: "Status" },
  { key: null, label: "Outcome", className: "pr-3" },
];

function Audit() {
  const { decisions, mode } = useVigil();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chain, setChain] = useState<ApiAuditVerify | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const v = await api.verifyAudit();
      setChain(v);
      if (v.ok) toast.success(`Audit hash chain intact (${v.records} records).`);
      else toast.error(`Audit hash chain broken at ${v.breaks.length} place(s).`);
    } catch (e) {
      toast.error(`Verify failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerifying(false);
    }
  };
  const [cat, setCat] = useState<Category | "all">("all");
  const [route, setRoute] = useState<"all" | "auto" | "human">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: AuditSortKey; dir: "asc" | "desc" } | null>(null);

  const rows = useMemo(() => {
    const filtered = decisions
      .filter(
        (d) =>
          (cat === "all" || d.category === cat) &&
          (route === "all" || d.mode === route) &&
          (status === "all" || d.status === status) &&
          inDateRange(d.timestamp, from, to),
      )
      .filter(
        (d) =>
          !q ||
          `${d.id} ${d.alertId} ${d.human ?? ""} ${d.backendAction ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      );
    // Default order: newest first by timestamp (UTC ISO strings sort correctly as text).
    const base = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return sort ? sortDecisions(base, sort.key, sort.dir) : base;
  }, [decisions, cat, route, status, q, sort, from, to]);

  const toggleSort = (key: AuditSortKey) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );

  const exportCsv = () => {
    const head =
      "id,alert,time,category,action,backend_action,override_of,reasoning,fallback_reason,route,human,cost,confidence,status,outcome";
    const body = rows.map((d) =>
      [
        d.id,
        d.alertId,
        d.timestamp,
        d.category,
        d.action,
        d.backendAction ?? "",
        d.override?.recommended ?? "",
        d.reasoning ? reasoningLabel(d.reasoning) : "",
        d.reasoning?.fallbackReason ? `"${d.reasoning.fallbackReason}"` : "",
        d.mode,
        d.human ?? "",
        d.cost,
        d.confidence,
        d.status,
        d.outcome,
      ].join(","),
    );
    const url = URL.createObjectURL(new Blob([[head, ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vigilai-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sel = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
  const filtered =
    cat !== "all" || route !== "all" || status !== "all" || q !== "" || from !== "" || to !== "";
  return (
    <div>
      <PageHeading
        title="Audit Log"
        subtitle={`${rows.length} of ${decisions.length} decisions · immutable record of every agent and human action`}
        actions={
          <div className="flex gap-2">
            {mode === "live" && (
              <button
                onClick={() => void verifyChain()}
                disabled={verifying}
                title={chain?.breaks.map((b) => `#${b.seq}: ${b.reason}`).join("\n") || undefined}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                {verifying
                  ? "Verifying…"
                  : chain === null
                    ? "Verify hash chain"
                    : chain.ok
                      ? `Chain intact · ${chain.records} records`
                      : `Chain broken · ${chain.breaks.length} issue(s)`}
              </button>
            )}
            <button
              onClick={exportCsv}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Export CSV
            </button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ID, action or approver…"
          className={sel}
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value as Category | "all")}
          className={sel}
          aria-label="Category filter"
        >
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <select
          value={route}
          onChange={(e) => setRoute(e.target.value as "all" | "auto" | "human")}
          className={sel}
          aria-label="Route filter"
        >
          <option value="all">All routes</option>
          <option value="auto">Auto-execute</option>
          <option value="human">Human review</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "all")}
          className={sel}
          aria-label="Status filter"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={sel}
            aria-label="From date"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={sel}
            aria-label="To date"
          />
        </label>
        {(filtered || sort) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setCat("all");
              setRoute("all");
              setStatus("all");
              setQ("");
              setSort(null);
            }}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2"
          >
            Clear
          </button>
        )}
      </div>
      <div className="panel overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  className={c.className}
                  aria-sort={
                    c.key && sort?.key === c.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.key ? (
                    <button
                      onClick={() => toggleSort(c.key!)}
                      className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-border/60 hover:bg-surface-2/50">
                <td className="p-3 font-mono text-xs">
                  {d.id}
                  <div className="text-muted-foreground">{d.alertId}</div>
                </td>
                <td className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(d.timestamp)}
                </td>
                <td>
                  <CategoryBadge category={d.category} />
                </td>
                <td>
                  {ACTION_META[d.action].label}
                  {d.backendAction && (
                    <div className="font-mono text-xs text-muted-foreground">{d.backendAction}</div>
                  )}
                  {d.override && (
                    <div className="text-xs text-warn" title={d.note}>
                      Override: recommended {d.override.recommended}
                    </div>
                  )}
                </td>
                <td>
                  {d.reasoning ? (
                    <ReasoningBadge source={d.reasoning} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-xs">{d.mode === "auto" ? "Auto" : "Human review"}</td>
                <td>
                  {d.mode === "auto" ? (
                    <span className="text-primary">Agent (auto)</span>
                  ) : (
                    <span
                      title={d.reviewedAt ? `Reviewed ${formatDateTime(d.reviewedAt)}` : undefined}
                    >
                      {d.human ?? "—"}
                      {d.timeToDecisionS !== undefined && (
                        <div className="font-mono text-xs text-muted-foreground">
                          after {formatDuration(d.timeToDecisionS)}
                        </div>
                      )}
                    </span>
                  )}
                </td>
                <td className="font-mono">{money(d.cost)}</td>
                <td className="font-mono">{d.confidence}%</td>
                <td className="capitalize">{d.status.replace("_", " ")}</td>
                <td
                  className={`pr-3 capitalize ${d.outcome === "correct" ? "text-ok" : d.outcome === "incorrect" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {d.outcome}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="p-6 text-center text-muted-foreground">
                  No decisions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
