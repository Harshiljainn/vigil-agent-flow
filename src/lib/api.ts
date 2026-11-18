/**
 * Typed client for the VigilAI backend (FastAPI, backend/vigilai/api.py).
 *
 * Types mirror the backend's pydantic models exactly: backend naming
 * (supplier_risk, shipment_telemetry, per-category action names) and 0-1 confidence.
 * Conversion to the frontend's display shapes happens in src/lib/adapter.ts.
 */

export const API_URL: string = (
  (import.meta.env["VITE_API_URL"] as string | undefined) || "http://localhost:8000"
).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 5000;
/** A new run may call Gemini (rate-limited, free tier), so it gets a much longer timeout. */
const RUN_TIMEOUT_MS = 120_000;

// ---------- backend types ----------

export type ApiCategory =
  | "weather"
  | "geopolitical"
  | "labor"
  | "regulatory"
  | "health"
  | "cyber"
  | "supplier_risk"
  | "shipment_telemetry";

export type ApiSeverity = "low" | "medium" | "high" | "critical";
export type ApiRoute = "auto_execute" | "human_review";

export type ApiSignal = {
  source: string;
  category: ApiCategory;
  summary: string;
  reliability: number;
  supports: boolean;
};

export type ApiEvidence = {
  doc_id: string;
  title: string;
  kind: string;
  snippet: string;
  score: number;
};

export type ApiAlert = {
  id: string;
  category: ApiCategory;
  severity: ApiSeverity;
  confidence: number;
  affected_shipments: number;
  supplier: string | null;
  signals: ApiSignal[];
  evidence: ApiEvidence[];
  grounded: boolean;
};

export type ApiMitigationOption = {
  action: string;
  description: string;
  cost_usd: number;
  delay_hours: number;
  reversible: boolean;
  confidence: number;
  source_docs: string[];
  /** Gemini only: share of the k Strategist samples that picked this action (0-1). */
  agreement?: number | null;
};

export type ApiLlmBackend = "rule" | "gemini";

/** Which reasoning backend produced an agent's output (backend schemas.Provenance). */
export type ApiProvenance = {
  backend: ApiLlmBackend;
  model: string | null;
  /** True when Gemini was asked but the rule-based result was used. */
  fallback: boolean;
  fallback_reason: string | null;
};

/** Synthesizer + Strategist reasoning for one alert (backend schemas.AgentReasoning). */
export type ApiAgentReasoning = {
  summary: string;
  reasoning: string;
  cited_doc_ids: string[];
  strategist_rationale: string;
  ranking: string[];
  votes: Record<string, number>;
  /** Strategist samples requested (0 = rule backend). */
  k: number;
  samples: number;
  agreement: number | null;
  synthesizer: ApiProvenance;
  strategist: ApiProvenance;
};

export type ApiThresholds = {
  cost_limit_usd: number;
  confidence_min: number;
  require_reversible: boolean;
};

export type ApiGateDecision = {
  route: ApiRoute;
  reasons: string[];
  thresholds: ApiThresholds;
};

export type ApiAlertView = {
  alert: ApiAlert;
  options: ApiMitigationOption[];
  chosen: ApiMitigationOption;
  decision: ApiGateDecision;
  audit_seq: number;
  status: string;
  reasoning?: ApiAgentReasoning | null;
};

export type ApiAuditRecord = {
  seq: number;
  alert_id: string;
  category: ApiCategory;
  action: string;
  cost_usd: number;
  confidence: number;
  reversible: boolean;
  route: ApiRoute;
  reasons: string[];
  actor: string;
  status: string;
  thresholds: ApiThresholds;
  evidence_ids: string[];
  review_of: number | null;
  note: string | null;
  /** True when the reviewer approved a non-recommended option ("Modify & Approve"). */
  override: boolean;
  /** The gate's recommended action; set on override records only. */
  recommended_action: string | null;
  /** "gemini" when any agent's output for this record came from Gemini. */
  llm_backend?: ApiLlmBackend;
  llm_model?: string | null;
  llm_fallback?: boolean;
  fallback_reason?: string | null;
};

export type ApiHealth = {
  status: "ok";
  alerts: number;
  escalated: number;
  auto_executed: number;
  tool_servers: string[];
  llm_backend?: ApiLlmBackend;
  llm_model?: string | null;
  llm_calls_used?: number;
  llm_max_calls?: number;
  /** Active retriever and knowledge base (Stage 5). */
  retriever?: ApiRetrieverName;
  corpus?: "v1" | "v2";
  corpus_docs?: number;
};

export type ApiRetrieverName = "tfidf" | "chroma" | "hybrid";

export type ApiThresholdsIn = { cost_limit_usd: number; confidence_min: number };

export type ApiReviewIn = {
  reviewer: string;
  verdict: "approve" | "reject";
  note?: string | null;
  /** Modify & Approve: backend action name of the option the reviewer picked. */
  chosen_action?: string | null;
};

export type ApiFlip = {
  alert_id: string;
  audit_seq: number;
  current_route: ApiRoute;
  proposed_route: ApiRoute;
  proposed_reasons: string[];
};

export type ApiPreview = {
  proposed: ApiThresholds;
  total_decisions: number;
  would_change: number;
  auto_to_human: number;
  human_to_auto: number;
  changes: ApiFlip[];
};

export type ApiKpis = {
  total_alerts: number;
  active_alerts: number;
  decisions: number;
  auto_executed: number;
  escalated: number;
  automation_rate: number;
  escalation_rate: number;
  pending_reviews: number;
  reviews_done: number;
};

/** One metrics block from backend/vigilai/evaluate.py metrics(). All rates are 0-1. */
export type ApiEvalMetrics = {
  n: number;
  decision_accuracy: number;
  automation_rate: number;
  human_review_workload: number;
  false_auto_execution_rate: number;
  false_auto_among_auto: number;
  unnecessary_escalation_rate: number;
};

export type ApiSweepPoint = {
  confidence_min: number;
  gate: ApiEvalMetrics;
  confidence_only: ApiEvalMetrics;
};

/** Per-category subset of the metrics (evaluate.py by_category()). */
export type ApiCategoryMetrics = Pick<
  ApiEvalMetrics,
  "n" | "decision_accuracy" | "automation_rate" | "false_auto_execution_rate"
>;

export type ApiCategoryBreakdown = Partial<
  Record<ApiCategory, { gate: ApiCategoryMetrics; confidence_only: ApiCategoryMetrics }>
>;

/** results/summary.json, passed through unchanged by GET /evaluation. */
export type ApiEvaluation = {
  summary: {
    note: string;
    gate: ApiEvalMetrics;
    confidence_only_baseline: ApiEvalMetrics;
    pipeline_action_accuracy: number;
    all_options_stress_test: { gate: ApiEvalMetrics; confidence_only_baseline: ApiEvalMetrics };
  };
  sweep_top1: ApiSweepPoint[];
  sweep_all_options: ApiSweepPoint[];
  by_category?: { top1: ApiCategoryBreakdown; all_options: ApiCategoryBreakdown };
};

export type ApiRetrievalScores = { n: number; "hit@1": number; "hit@3": number; mrr: number };

export type ApiRetrievalBlock = { random_baseline: ApiRetrievalScores } & Record<
  ApiRetrieverName,
  ApiRetrievalScores & { by_category?: Partial<Record<ApiCategory, ApiRetrievalScores>> }
>;

/** results/retrieval_comparison.json, passed through unchanged by GET /evaluation/retrieval. */
export type ApiRetrievalComparison = {
  note: string;
  setup: {
    corpus: string;
    documents: number;
    queries: number;
    hybrid: string;
    embedding_model: string;
  };
  with_category_filter: ApiRetrievalBlock;
  without_filter: ApiRetrievalBlock;
};

export type AuditFilter = { category?: ApiCategory; route?: ApiRoute; status?: string };

// ---------- transport ----------

export class ApiError extends Error {
  /** HTTP status, or 0 when the backend could not be reached / timed out. */
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    const req: RequestInit = { method: init.method ?? "GET", signal: controller.signal };
    if (init.body !== undefined) {
      req.headers = { "Content-Type": "application/json" };
      req.body = JSON.stringify(init.body);
    }
    res = await fetch(`${API_URL}${path}`, req);
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    throw new ApiError(0, timedOut ? `Request to ${path} timed out` : `Backend unreachable`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (body.detail !== undefined) {
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------- endpoints (one function per backend route) ----------

export const api = {
  health: (timeoutMs?: number) =>
    request<ApiHealth>("/health", timeoutMs !== undefined ? { timeoutMs } : {}),
  alerts: () => request<ApiAlertView[]>("/alerts"),
  alert: (id: string) => request<ApiAlertView>(`/alerts/${encodeURIComponent(id)}`),
  runScenario: () =>
    request<ApiAlertView>("/scenarios/run", { method: "POST", timeoutMs: RUN_TIMEOUT_MS }),
  queue: () => request<ApiAuditRecord[]>("/queue"),
  review: (seq: number, body: ApiReviewIn) =>
    request<ApiAuditRecord>(`/queue/${seq}/review`, { method: "POST", body }),
  thresholds: () => request<ApiThresholds>("/thresholds"),
  putThresholds: (body: ApiThresholdsIn) =>
    request<ApiThresholds>("/thresholds", { method: "PUT", body }),
  previewThresholds: (body: ApiThresholdsIn) =>
    request<ApiPreview>("/thresholds/preview", { method: "POST", body }),
  audit: (filter: AuditFilter = {}) => request<ApiAuditRecord[]>(`/audit${query(filter)}`),
  evaluation: () => request<ApiEvaluation>("/evaluation"),
  retrievalEvaluation: () => request<ApiRetrievalComparison>("/evaluation/retrieval"),
  kpis: () => request<ApiKpis>("/kpis"),
};
