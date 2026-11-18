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
/** POST /signals/live/run starts three MCP servers and may wait on GDELT (slow, rate-limited). */
const LIVE_TIMEOUT_MS = 240_000;

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
  /** Stage 6 live signals only. */
  location?: string | null;
  observed_at?: string | null;
  stale?: boolean;
  simulated?: boolean;
  urls?: string[];
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
  /** "live" = built from real MCP signals (no ground truth, never in evaluation numbers). */
  origin?: ApiOrigin;
  location?: string | null;
  server_status?: Record<string, string>;
  failed_servers?: string[];
  rules?: Record<string, string>;
};

export type ApiOrigin = "synthetic" | "live";

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
  /** Stage 7: when the gate decided (UTC ISO). */
  created_at?: string | null;
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
  origin?: ApiOrigin;
  /** Stage 7: UTC ISO time the record was stored (for a review record = reviewed_at). */
  created_at?: string | null;
  /** Review records: seconds from escalation to the review. */
  time_to_decision_s?: number | null;
  /** Hash chain (GET /audit/verify). */
  prev_hash?: string | null;
  hash?: string | null;
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
  /** Stage 6: VIGIL_SIGNALS and each MCP server's last known state. */
  signals?: "replay" | "live";
  mcp_servers?: ApiServerStatus[];
  /** Stage 7: state is stored in SQLite; write endpoints need a login. */
  persistence?: string;
  auth?: boolean;
};

export type ApiRole = "operator" | "reviewer";

export type ApiUser = { username: string; name: string; role: ApiRole };

export type ApiLogin = { token: string; expires_at: string; user: ApiUser };

export type ApiMe = { user: ApiUser; expires_at: string };

export type ApiAuditVerify = {
  ok: boolean;
  records: number;
  last_hash: string | null;
  breaks: { seq: number; reason: string }[];
};

export type ApiThresholdChange = {
  id: number;
  username: string;
  field: "cost_limit_usd" | "confidence_min";
  old_value: number;
  new_value: number;
  created_at: string;
};

export type ApiServerState = "ok" | "empty" | "stale_cache" | "failing" | "not_run" | "replay";

export type ApiServerStatus = {
  name: string;
  kind: "live" | "simulated";
  state: ApiServerState;
  detail: string | null;
  checked_at: string | null;
  tools: string[];
};

export type ApiNewsCounts = {
  fetched: number;
  dropped_irrelevant: number;
  dropped_duplicate: number;
  kept_articles: number;
  signals: number;
};

export type ApiLiveReport = {
  checked_at: string;
  servers: ApiServerStatus[];
  failed_servers: string[];
  news: ApiNewsCounts | null;
  weather_ports_checked: number;
  weather_severe_ports: string[];
  signals_received: number;
  contradictions_added: number;
  groups: number;
  alerts_built: number;
  skipped: string[];
  rules: Record<string, string>;
};

export type ApiLiveRun = { alerts: ApiAlertView[]; report: ApiLiveReport };

export type ApiRetrieverName = "tfidf" | "chroma" | "hybrid";

export type ApiThresholdsIn = { cost_limit_usd: number; confidence_min: number };

/** The reviewer is the logged-in user (Stage 7), so the body has no name. */
export type ApiReviewIn = {
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
  /** origin=live alerts; rates above cover synthetic alerts only. */
  live_alerts?: number;
  /** Stage 7: mean seconds from escalation to review, null when no review has a time. */
  avg_time_to_decision_s?: number | null;
  timed_reviews?: number;
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

// Stage 7: the session token for write endpoints. Set by the state layer after login.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Called when the backend answers 401 to a request that carried a token (expired session). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

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
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      req.body = JSON.stringify(init.body);
    }
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    req.headers = headers;
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
    if (res.status === 401 && authToken && !path.startsWith("/auth/login")) onUnauthorized?.();
    throw new ApiError(res.status, `${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
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
  runLiveSignals: () =>
    request<ApiLiveRun>("/signals/live/run", { method: "POST", timeoutMs: LIVE_TIMEOUT_MS }),
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
  login: (username: string, password: string) =>
    request<ApiLogin>("/auth/login", { method: "POST", body: { username, password } }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<ApiMe>("/auth/me"),
  verifyAudit: () => request<ApiAuditVerify>("/audit/verify"),
  thresholdHistory: () => request<ApiThresholdChange[]>("/thresholds/history"),
};
