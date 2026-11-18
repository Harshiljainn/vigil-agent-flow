import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, Radio, Send, ShieldCheck, UserCheck } from "lucide-react";
import { PageHeading } from "@/components/bits";
import { BUILT, PIPELINE_NODES, PLANNED, TOOL_SERVERS, TOOL_SERVER_ROLE } from "@/data/system";
import { cn } from "@/lib/utils";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — VigilAI" },
      {
        name: "description",
        content:
          "What VigilAI is built from today — tool servers, rule-based agents, TF-IDF retrieval, a deterministic Decision Gate — and what is planned.",
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
    status: "simulated",
    body: `Three signal agents query ${TOOL_SERVERS.join(", ")}. Today these replay recorded scenario signals; live feeds are planned.`,
  },
  {
    icon: Database,
    title: "2. Retrieval (RAG)",
    status: "built",
    body: "TF-IDF search over 16 hand-written playbooks and incident notes grounds each alert. A vector store (ChromaDB) is planned.",
  },
  {
    icon: Bot,
    title: "3. Synthesizer & Strategist",
    status: "simulated",
    body: "Rule-based agents fuse signals into a confidence-scored alert and rank mitigation options from an action catalogue. LLM versions are planned.",
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

function Architecture() {
  const { mode, health } = useVigil();
  const servers = health?.tool_servers ?? [...TOOL_SERVERS];
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
                    mode === "live" ? "bg-ok" : "bg-muted-foreground",
                  )}
                />
                <span className="font-mono">{m}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {mode === "live" ? "replay · reported by /health" : "backend offline"}
                </span>
              </div>
              {m in TOOL_SERVER_ROLE && (
                <p className="ml-4 text-xs text-muted-foreground">
                  {TOOL_SERVER_ROLE[m as keyof typeof TOOL_SERVER_ROLE]}
                </p>
              )}
            </div>
          ))}
          <p className="mb-2 mt-5 text-sm font-medium">Stack</p>
          <p className="text-sm text-muted-foreground">
            Frontend: React + TanStack Start, Tailwind, Recharts. Backend: Python, FastAPI,
            pydantic, scikit-learn TF-IDF. State is in memory until the database stage.
          </p>
        </div>
      </div>
    </div>
  );
}
