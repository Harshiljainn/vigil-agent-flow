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
};

export type ApiHealth = {
  status: "ok";
  alerts: number;
  escalated: number;
  auto_executed: number;
  tool_servers: string[];
};

export type ApiThresholdsIn = { cost_limit_usd: number; confidence_min: number };

export type ApiReviewIn = {
  reviewer: string;
  verdict: "approve" | "reject";
  note?: string | null;
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

/** results/summary.json is passed through unchanged; its shape is owned by evaluate.py. */
export type ApiEvaluation = Record<string, unknown>;

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
  runScenario: () => request<ApiAlertView>("/scenarios/run", { method: "POST" }),
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
  kpis: () => request<ApiKpis>("/kpis"),
};
