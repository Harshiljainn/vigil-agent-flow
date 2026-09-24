import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, Radio, ShieldCheck, Send, UserCheck } from "lucide-react";
import { PageHeading } from "@/components/bits";
import { PIPELINE } from "@/data/vigilai";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — VigilAI" },
      { name: "description", content: "How VigilAI's signal agents, RAG reasoning, MCP tools and human-in-the-loop Decision Gate fit together." },
      { property: "og:title", content: "System Architecture — VigilAI" },
      { property: "og:description", content: "Layered view of agents, MCP servers, RAG knowledge base and the human approval gate." },
    ],
  }),
  component: Architecture,
});

const LAYERS = [
  { icon: Radio, title: "1. Signal ingestion", body: "Signal agents poll external feeds through MCP servers (weather, news, supplier ERP, IoT telemetry)." },
  { icon: Database, title: "2. Retrieval (RAG)", body: "Vector store of past incidents, supplier contracts and SOPs grounds every recommendation with citations." },
  { icon: Bot, title: "3. LLM reasoning", body: "Risk & Planner agents classify severity, estimate impact and rank mitigation options with cost & delay." },
  { icon: ShieldCheck, title: "4. Decision Gate", body: "Deterministic policy: auto-execute only if cost ≤ limit, confidence ≥ floor and the action is reversible." },
  { icon: UserCheck, title: "5. Human in the loop", body: "Escalated decisions land in the queue for approve / modify / reject by an operations analyst." },
  { icon: Send, title: "6. Execution & audit", body: "Comms agent notifies stakeholders, executes via ERP/TMS tools, and writes an immutable audit record." },
];

const MCP = ["weather-mcp", "news-mcp", "erp-mcp", "tms-mcp"];

function Architecture() {
  return (
    <div>
      <PageHeading title="System Architecture" subtitle="End-to-end flow from raw signal to audited action." />
      <div className="grid gap-3 md:grid-cols-3">
        {LAYERS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="panel p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15"><Icon className="h-4 w-4 text-primary" /></div>
              <p className="font-medium">{title}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-medium">Agents & their MCP tools</p>
          <div className="space-y-2">
            {PIPELINE.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-sm font-medium">{a.name} <span className="ml-1 text-xs uppercase text-muted-foreground">{a.kind}</span></span>
                <code className="font-mono text-xs text-primary">{a.mcp}</code>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <p className="mb-3 text-sm font-medium">Connected MCP servers</p>
          {MCP.map((m) => (
            <div key={m} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="h-2 w-2 rounded-full bg-ok" /> <span className="font-mono">{m}</span>
              <span className="ml-auto text-xs text-muted-foreground">healthy</span>
            </div>
          ))}
          <p className="mb-2 mt-5 text-sm font-medium">Stack</p>
          <p className="text-sm text-muted-foreground">React + TanStack Start, Recharts, LLM agents orchestrated as a DAG, vector-store RAG, Model Context Protocol tool servers.</p>
        </div>
      </div>
    </div>
  );
}
