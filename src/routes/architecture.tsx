import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, Radio, Send, ShieldCheck, UserCheck } from "lucide-react";
import { PageHeading } from "@/components/bits";
import { BUILT, PIPELINE_NODES, PLANNED, TOOL_SERVERS, TOOL_SERVER_ROLE } from "@/data/system";
import { retrievalLabel } from "@/lib/adapter";
import type { ApiServerStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — VigilAI" },
      {
        name: "description",
        content:
          "What VigilAI is built from today — tool servers, Synthesizer and Strategist agents (Gemini or rule-based), TF-IDF / ChromaDB / hybrid retrieval, a deterministic Decision Gate — and what is planned.",
      },
      { property: "og:title", content: "System Architecture — VigilAI" },
      {
        property: "og:description",
        content: "Built vs planned parts of the VigilAI human-in-the-loop pipeline.",
      },
    ],
  }),
  component: Architecture,
});

const LAYERS = [
  {
    icon: Radio,
    title: "1. Signal ingestion",
    status: "built",
    body: `Three signal agents talk to real MCP servers (${TOOL_SERVERS.join(", ")}) over stdio. With VIGIL_SIGNALS=live, weather-mcp reads Open-Meteo forecasts and news-mcp reads the GDELT news API; supplychain-mcp serves simulated exposure data. The default (replay) replays synthetic scenario signals.`,
  },
  {
    icon: Database,
    title: "2. Retrieval (RAG)",
    status: "built",
    body: "The top 3 same-category documents ground each alert. Retriever: TF-IDF (default), ChromaDB vector search with a local all-MiniLM-L6-v2 model, or a hybrid (average of both scores). Knowledge base: v1 (16 docs) or v2 (56 docs), all hand-written for the project.",
  },
  {
    icon: Bot,
    title: "3. Synthesizer & Strategist",
    status: "built",
    body: "Agents fuse signals into a confidence-scored alert (confidence computed by code) and rank mitigation options from an action catalogue. Gemini writes the reasoning and ranking when VIGIL_LLM=gemini; otherwise rules do, and any Gemini failure falls back to rules.",
  },
  {
    icon: ShieldCheck,
    title: "4. Decision Gate",
    status: "built",
    body: "Deterministic code: auto-execute only if cost ≤ limit, confidence ≥ minimum and the action is reversible.",
  },
  {
    icon: UserCheck,
    title: "5. Human in the loop",
    status: "built",
    body: "Escalated decisions land in the queue for approve, reject, or Modify & Approve (pick another option).",
  },
  {
    icon: Send,
    title: "6. Execution & audit",
    status: "simulated",
    body: "Auto-execution only writes an audit record (in memory). Notifications and a database are planned.",
  },
] as const;

const STATUS_STYLE: Record<string, string> = {
  built: "bg-ok/15 text-ok",
  simulated: "bg-primary/15 text-primary",
  planned: "bg-surface-2 text-muted-foreground",
};

function Tag({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

/** Dot colour for one MCP server's last known state (GET /health mcp_servers). */
function serverDot(s: ApiServerStatus | undefined): string {
  if (!s || s.state === "replay" || s.state === "not_run") return "bg-muted-foreground";
  if (s.state === "failing") return "bg-destructive";
  if (s.state === "stale_cache") return "bg-warn";
  return "bg-ok";
}

/** "live", "simulated" or "failing", plus the state reported by /health. */
function serverLabel(s: ApiServerStatus | undefined): string {
  if (!s) return "replay · reported by /health";
  if (s.state === "replay") return "replay (VIGIL_SIGNALS=replay)";
  if (s.state === "failing") return "failing · last live run";
  if (s.state === "not_run") return `${s.kind} · not called yet`;
  const extra = { ok: "", empty: " · no events", stale_cache: " · stale cache" }[s.state];
  return `${s.kind}${extra} · last live run`;
}

function Architecture() {
  const { mode, health } = useVigil();
  const servers = health?.tool_servers ?? [...TOOL_SERVERS];
  const status = new Map((health?.mcp_servers ?? []).map((s) => [s.name, s]));
  const retrieval = mode === "live" ? retrievalLabel(health) : null;
  return (
    <div>
      <PageHeading
        title="System Architecture"
        subtitle="End-to-end flow from signal to audited action — what is built today and what is planned."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {LAYERS.map(({ icon: Icon, title, body, status }) => (
          <div key={title} className="panel p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="font-medium">{title}</p>
              <span className="ml-auto">
                <Tag status={status} />
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <Tag status="built" /> working code · <Tag status="simulated" /> working code on
        replayed/synthetic data or rules instead of an LLM · <Tag status="planned" /> not built
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-medium">Pipeline stages & their code</p>
          <div className="space-y-2">
            {PIPELINE_NODES.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2",
                  !a.built && "opacity-70",
                )}
              >
                <span className="text-sm font-medium">
                  {a.name}{" "}
                  <span className="ml-1 text-xs uppercase text-muted-foreground">{a.kind}</span>
                </span>
                {a.built ? (
                  <code className="font-mono text-xs text-primary">{a.code}</code>
                ) : (
                  <Tag status="planned" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Built</p>
              <ul className="space-y-1.5 text-sm">
                {BUILT.map((c) => (
                  <li key={c.name}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground"> — {c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Planned{" "}
                <span className="text-xs font-normal text-muted-foreground">(not built)</span>
              </p>
              <ul className="space-y-1.5 text-sm">
                {PLANNED.map((c) => (
                  <li key={c.name} className="flex flex-wrap items-baseline gap-1">
                    <Tag status="planned" />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground"> — {c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="panel p-4">
          <p className="mb-3 text-sm font-medium">Tool servers</p>
          {servers.map((m) => (
            <div key={m} className="py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    mode === "live" ? serverDot(status.get(m)) : "bg-muted-foreground",
                  )}
                />
                <span className="font-mono">{m}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {mode === "live" ? serverLabel(status.get(m)) : "backend offline"}
                </span>
              </div>
              {mode === "live" && status.get(m)?.detail && (
                <p
                  className="ml-4 line-clamp-2 font-mono text-[11px] text-muted-foreground"
                  title={status.get(m)!.detail ?? undefined}
                >
                  {status.get(m)!.detail}
                </p>
              )}
              {m in TOOL_SERVER_ROLE && (
                <p className="ml-4 text-xs text-muted-foreground">
                  {TOOL_SERVER_ROLE[m as keyof typeof TOOL_SERVER_ROLE]}
                </p>
              )}
            </div>
          ))}
          <p className="mb-2 mt-5 text-sm font-medium">Retrieval</p>
          <div className="py-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={cn("h-2 w-2 rounded-full", retrieval ? "bg-ok" : "bg-muted-foreground")}
              />
              <span className="font-mono">{retrieval ?? "unknown"}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {mode !== "live"
                  ? "backend offline"
                  : retrieval
                    ? "active · reported by /health"
                    : "not reported by /health"}
              </span>
            </div>
            <p className="ml-4 text-xs text-muted-foreground">
              Set with VIGIL_RETRIEVER (tfidf | chroma | hybrid) and VIGIL_CORPUS (v1 | v2).
            </p>
          </div>
          <p className="mb-2 mt-5 text-sm font-medium">Stack</p>
          <p className="text-sm text-muted-foreground">
            Frontend: React + TanStack Start, Tailwind, Recharts. Backend: Python, FastAPI,
            pydantic, scikit-learn TF-IDF, ChromaDB (local, ONNX embeddings). State is in memory
            until the database stage.
          </p>
        </div>
      </div>
    </div>
  );
}
