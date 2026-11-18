/**
 * What the VigilAI system really contains today, in one place, so every page shows the
 * same names. Source of truth: the backend (backend/vigilai/tools.py SERVER_NAMES,
 * agents.py, retrieval.py, gate.py). Live pages prefer GET /health `tool_servers`.
 */

/** The three MCP tool servers (backend/vigilai/mcp_servers). Replay by default, live with VIGIL_SIGNALS=live. */
export const TOOL_SERVERS = ["weather-mcp", "news-mcp", "supplychain-mcp"] as const;
export type ToolServer = (typeof TOOL_SERVERS)[number];

export const TOOL_SERVER_ROLE: Record<ToolServer, string> = {
  "weather-mcp": "Weather signals (Open-Meteo forecasts for 6 monitored ports)",
  "news-mcp": "News signals (GDELT, filtered to monitored ports and lanes)",
  "supplychain-mcp": "Simulated shipment exposure, telemetry and supplier data",
};

export type NodeKind = "signal" | "agent" | "gate" | "comms";

/** Pipeline stages in order. `built: false` = planned, not implemented. */
export type PipelineNode = {
  id: string;
  name: string;
  kind: NodeKind;
  built: boolean;
  /** What the code does today (honest description). */
  role: string;
  /** Backend code location. */
  code: string;
};

export const SIGNAL_NODES: PipelineNode[] = TOOL_SERVERS.map((s) => ({
  id: s,
  name: s,
  kind: "signal" as const,
  built: true,
  role: `Signal agent that queries ${s} (${TOOL_SERVER_ROLE[s].toLowerCase()}). Replays synthetic scenario signals by default; with VIGIL_SIGNALS=live it calls the real MCP server over stdio.`,
  code: `vigilai/mcp_servers/${s.replace("-mcp", "")}_server.py · vigilai/live.py`,
}));

export const PIPELINE_NODES: PipelineNode[] = [
  ...SIGNAL_NODES,
  {
    id: "synthesizer",
    name: "Synthesizer",
    kind: "agent",
    built: true,
    role: "Code computes confidence: combines supporting signals by source reliability (noisy-OR), lowers it for contradicting signals, retrieves the top 3 same-category documents (TF-IDF by default; ChromaDB vectors or a hybrid with VIGIL_RETRIEVER, over corpus v1 or v2) and lowers it again if the alert is not grounded. The summary and reasoning text come from Gemini (VIGIL_LLM=gemini) or a rule template (VIGIL_LLM=off).",
    code: "vigilai/agents.py SynthesizerAgent + retrieval.py",
  },
  {
    id: "strategist",
    name: "Strategist",
    kind: "agent",
    built: true,
    role: "Builds one option per catalogue action for the category (knowledge/actions.json); cost, delay and reversibility come from the catalogue. Rule backend: ranks options backed by retrieved documents first, then cheaper ones. Gemini backend: ranks the same catalogue actions k times; the share of samples that agree lowers option confidence when the model is unsure. The first option is the recommendation.",
    code: "vigilai/agents.py StrategistAgent",
  },
  {
    id: "gate",
    name: "Decision Gate",
    kind: "gate",
    built: true,
    role: "Deterministic code, no LLM: auto-executes only if cost ≤ limit, confidence ≥ minimum and the action is reversible; otherwise routes to a human.",
    code: "vigilai/gate.py evaluate()",
  },
  {
    id: "comms",
    name: "Notifications",
    kind: "comms",
    built: false,
    role: "Planned: notify stakeholders after a decision. Not built; today auto-execution only writes an audit record.",
    code: "—",
  },
];

export type Component = { name: string; detail: string };

/** Parts that exist as working (or simulated) code in backend/ and frontend/. */
export const BUILT: Component[] = [
  {
    name: "MCP tool servers",
    detail: `${TOOL_SERVERS.join(", ")} — real MCP servers (stdio, official Python SDK). Live: Open-Meteo and GDELT; supplychain-mcp is simulated. Default mode replays synthetic signals.`,
  },
  {
    name: "Synthesizer + Strategist",
    detail:
      "Typed pydantic inputs and outputs; reasoning from Gemini (free tier, cached, rate-limited, budgeted) or the rule-based fallback.",
  },
  {
    name: "Retrieval (RAG)",
    detail:
      "TF-IDF (default), ChromaDB vector search (all-MiniLM-L6-v2, local ONNX) or a hybrid of both, over hand-written playbooks and incident notes: corpus v1 (16 docs) or v2 (56 docs).",
  },
  {
    name: "Decision Gate",
    detail: "Deterministic thresholds: cost ≤ 12,000 USD, confidence ≥ 0.78, reversible only.",
  },
  {
    name: "Human review queue",
    detail: "Approve, reject or Modify & Approve (choose a different option) escalated decisions.",
  },
  {
    name: "Audit log",
    detail: "In-memory, append-only; every gate decision and human review is a record.",
  },
  {
    name: "HTTP API",
    detail: "FastAPI backend that this dashboard reads from.",
  },
  {
    name: "Evaluation harness",
    detail:
      "Gate vs confidence-only baseline on synthetic scenarios, with threshold sweeps; retrieval hit@k and MRR on a hand-labelled query set.",
  },
];

/** Parts described in the design but not built yet. */
export const PLANNED: Component[] = [
  { name: "LangGraph orchestration", detail: "Run the pipeline stages as a graph." },
  {
    name: "Live supply-chain data",
    detail: "Real shipment, telemetry and supplier feeds behind supplychain-mcp (simulated today).",
  },
  { name: "Database", detail: "Persist alerts and the audit log (with timestamps)." },
  { name: "Notifications", detail: "Stakeholder messages after a decision." },
];
