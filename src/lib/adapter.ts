/**
 * Converts backend API data (src/lib/api.ts) into the shapes the existing pages use
 * (src/data/vigilai.ts). The backend is the source of truth; this file only converts
 * for display. See the mismatch table in the project CLAUDE.md.
 */
import type {
  ApiAiEvalBlock,
  ApiAiEvaluation,
  ApiAiGeminiEvaluation,
  ApiAlertView,
  ApiAuditRecord,
  ApiCategory,
  ApiEvalMetrics,
  ApiEvaluation,
  ApiHealth,
  ApiKpis,
  ApiMitigationOption,
  ApiRetrievalBlock,
  ApiRetrievalComparison,
  ApiRetrieverName,
  ApiSweepPoint,
  ApiThresholds,
} from "./api";
import type {
  ActionType,
  Alert,
  Category,
  Decision,
  Evidence,
  MitigationOption,
  ReasoningSource,
  Status,
} from "../data/vigilai";
import { DEMO_NOW_MS } from "../data/vigilai";

// ---------- categories ----------

export const CATEGORY_FROM_API: Record<ApiCategory, Category> = {
  weather: "weather",
  geopolitical: "geopolitical",
  labor: "labor",
  regulatory: "regulatory",
  health: "health",
  cyber: "cyber",
  supplier_risk: "supplier",
  shipment_telemetry: "telemetry",
};

export function toCategory(c: ApiCategory): Category {
  return CATEGORY_FROM_API[c];
}

// ---------- confidence ----------

/** Backend 0-1 float -> frontend 0-100 integer. */
export function toPct(x: number): number {
  return Math.round(x * 100);
}

// ---------- actions ----------

/**
 * Backend per-category action names (backend/vigilai/knowledge/actions.json) mapped to
 * the nearest of the frontend's 8 generic action types. The original name is always kept
 * on the converted object (backendAction) so it can be shown, and reversibility always
 * comes from the backend's own `reversible` flag, never from this mapping.
 */
export const ACTION_TYPE_BY_BACKEND: Record<string, ActionType> = {
  // weather
  reroute_shipment: "reroute",
  hold_departure: "notify_only",
  cancel_and_rebook: "reroute",
  // geopolitical
  divert_via_cape: "reroute",
  wait_for_clearance: "notify_only",
  charter_air_freight: "expedite",
  // labor
  alternate_port: "reroute",
  prebook_trucking: "expedite",
  // regulatory
  reclassify_and_refile: "notify_only",
  expedited_clearance: "expedite",
  return_to_origin: "force_majeure",
  // health
  divert_unrestricted_port: "reroute",
  request_preclearance: "expedite",
  dispose_perishables: "force_majeure",
  // cyber
  manual_documentation: "notify_only",
  move_to_alternate_carrier: "switch_supplier",
  terminate_carrier_contract: "force_majeure",
  // supplier_risk
  qualify_backup_supplier: "split_order",
  expedite_open_orders: "expedite",
  switch_supplier: "switch_supplier",
  // shipment_telemetry
  alert_carrier_check_container: "notify_only",
  replacement_unit: "expedite",
  dispose_cargo: "force_majeure",
};

export function toActionType(backendAction: string): ActionType {
  return ACTION_TYPE_BY_BACKEND[backendAction] ?? "notify_only";
}

// ---------- statuses ----------

/** Backend statuses carry a "(simulated)" suffix, e.g. "auto_executed(simulated)". */
export function toStatus(s: string): Status {
  const base = s.replace(/\(.*\)$/, "").trim();
  if (base === "auto_executed") return "auto_executed";
  if (base === "approved") return "approved";
  if (base === "rejected") return "rejected";
  return "pending";
}

// ---------- alerts ----------

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function toOption(alertId: string, o: ApiMitigationOption, i: number): MitigationOption {
  return {
    id: `${alertId}-OPT-${i + 1}`,
    action: toActionType(o.action),
    description: o.description,
    cost: o.cost_usd,
    // The backend reports the delay an option causes, not a reduction; see delayHours.
    delayReductionHours: 0,
    backendAction: o.action,
    reversible: o.reversible,
    delayHours: o.delay_hours,
    confidence: toPct(o.confidence),
    confidenceExact: o.confidence,
  };
}

export function toAlert(v: ApiAlertView): Alert {
  const a = v.alert;
  const options = v.options.map((o, i) => toOption(a.id, o, i));
  const chosenIdx = v.options.findIndex((o) => o.action === v.chosen.action);
  const lead = a.signals.find((s) => s.supports) ?? a.signals[0];

  const evidence: Evidence[] = [
    ...a.signals.map((s) => ({
      agent: s.source,
      text: s.supports ? capitalize(s.summary) : `${capitalize(s.summary)} (contradicting signal)`,
      grounded: false,
    })),
    ...a.evidence.map((e) => ({
      agent: e.doc_id,
      text: `${e.title}: ${e.snippet}`,
      grounded: true,
    })),
  ];

  return {
    id: a.id,
    category: toCategory(a.category),
    severity: a.severity,
    summary: lead ? capitalize(lead.summary) : "Disruption signal",
    confidence: toPct(a.confidence),
    createdAt: v.created_at ?? "",
    status: toStatus(v.status),
    shipments: [], // backend gives a count, not IDs
    shipmentCount: a.affected_shipments,
    supplier: a.supplier ?? "—",
    evidence,
    options,
    recommendedOptionId: options[chosenIdx >= 0 ? chosenIdx : 0]?.id ?? "",
    auditSeq: v.audit_seq,
    gateReasons: v.decision.reasons,
    route: v.decision.route,
    origin: a.origin ?? "synthetic",
    ...(toAlertReasoning(v) ? { reasoning: toAlertReasoning(v) } : {}),
    ...(a.location ? { location: a.location } : {}),
    ...(a.failed_servers?.length ? { failedServers: a.failed_servers } : {}),
  };
}

// ---------- audit -> decisions ----------

/**
 * One Decision per gate record. A human review is a separate backend audit row
 * (review_of = gate seq); it is merged into its gate row here: approver = reviewer,
 * status = verdict. On an override ("Modify & Approve") the review record carries the
 * chosen option's own action, cost, confidence and reversibility, so those are shown.
 */
export function toDecisions(audit: ApiAuditRecord[]): Decision[] {
  const reviews = new Map<number, ApiAuditRecord>();
  for (const r of audit) if (r.review_of !== null) reviews.set(r.review_of, r);

  return audit
    .filter((r) => r.review_of === null)
    .sort((a, b) => b.seq - a.seq)
    .map((g) => {
      const review = reviews.get(g.seq);
      const shown = review?.override ? review : g;
      const backendAction = shown.action;
      const d: Decision = {
        id: `DEC-${String(g.seq).padStart(4, "0")}`,
        alertId: g.alert_id,
        timestamp: g.created_at ?? "",
        category: toCategory(g.category),
        action: toActionType(backendAction),
        mode: g.route === "auto_execute" ? "auto" : "human",
        human: review ? review.actor : null,
        cost: shown.cost_usd,
        confidence: toPct(shown.confidence),
        status: toStatus(review ? review.status : g.status),
        outcome: "pending", // no per-decision ground truth from the API
        backendAction,
      };
      d.reversible = shown.reversible;
      d.route = g.route;
      if (review?.override) {
        d.override = { recommended: review.recommended_action ?? g.action, chosen: review.action };
      }
      if (review?.note) d.note = review.note;
      if (review?.created_at) d.reviewedAt = review.created_at;
      if (typeof review?.time_to_decision_s === "number") {
        d.timeToDecisionS = review.time_to_decision_s;
      }
      d.reasoning = toReasoningSource(g);
      return d;
    });
}

// ---------- reasoning provenance ----------

/** Audit record -> which backend produced the reasoning. Old records without the fields are rule. */
export function toReasoningSource(r: ApiAuditRecord): ReasoningSource {
  return {
    backend: r.llm_backend ?? "rule",
    model: r.llm_model ?? null,
    fallback: r.llm_fallback ?? false,
    fallbackReason: r.fallback_reason ?? null,
  };
}

/** Short display label: "Gemini · model", "Gemini unavailable — rule fallback (reason)" or "Seed — rule based". */
export function reasoningLabel(s: ReasoningSource): string {
  if (s.backend === "gemini")
    return `${s.model ? `Gemini · ${s.model}` : "Gemini"}${s.fallback ? " (partial fallback)" : ""}`;
  if (s.fallback) return `Gemini unavailable — rule fallback (${s.fallbackReason ?? "no reason"})`;
  // since Stage 11 every new alert tries Gemini, so a rule result without a fallback is a seed alert
  return "Seed — rule based";
}

/** Alert view -> reasoning source: Gemini if any agent used it; else fallback if any fell back. */
export function toAlertReasoning(v: ApiAlertView): ReasoningSource | undefined {
  const r = v.reasoning;
  if (!r) return undefined;
  const provs = [r.synthesizer, r.strategist];
  const fb = provs.filter((p) => p.fallback);
  const reasons = [...new Set(fb.map((p) => p.fallback_reason).filter(Boolean))];
  return {
    backend: provs.some((p) => p.backend === "gemini") ? "gemini" : "rule",
    model: provs.find((p) => p.model)?.model ?? null,
    fallback: fb.length > 0,
    fallbackReason: reasons.length ? reasons.join("; ") : null,
  };
}

// ---------- thresholds ----------

export type DisplayThresholds = { cost: number; confidence: number };

export function toThresholds(t: ApiThresholds): DisplayThresholds {
  return { cost: t.cost_limit_usd, confidence: toPct(t.confidence_min) };
}

// ---------- KPIs ----------

export type DisplayKpis = {
  activeAlerts: number;
  decisions: number;
  autoPct: number;
  escalatedPct: number;
  /** Not measured by the backend; null means "—". */
  hoursSaved: number | null;
  /** Audit records (gate decisions + human reviews) stored on today's local date. */
  decisionsToday: number;
  /** Mean seconds from escalation to review (backend /kpis); null = no timed reviews. */
  avgTimeToDecisionS: number | null;
  timedReviews: number;
};

/** True when a session expiry (ISO) has passed, or cannot be read. */
export function sessionExpired(expiresAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t <= now;
}

/** True when two instants fall on the same calendar day in the browser's time zone. */
export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** How many ISO timestamps fall on the local calendar day of `now`. Empty/invalid ones are skipped. */
export function countOnDay(timestamps: (string | null | undefined)[], now: Date): number {
  let n = 0;
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = new Date(ts);
    if (!Number.isNaN(t.getTime()) && sameLocalDay(t, now)) n++;
  }
  return n;
}

/**
 * Date-range filter on a local calendar date. from/to are "YYYY-MM-DD" from <input type="date">
 * (inclusive, either may be empty). A row without a timestamp only passes when no range is set.
 */
export function inDateRange(ts: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const t = new Date(ts);
  if (!ts || Number.isNaN(t.getTime())) return false;
  const day = localDateKey(t);
  return (!from || day >= from) && (!to || day <= to);
}

/** "YYYY-MM-DD" of an instant in the browser's time zone. */
export function localDateKey(t: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/**
 * Live KPIs from one /kpis response, plus Decisions Today counted from the audit rows' real
 * created_at. Escalated% = 100 - Auto% so the two always agree.
 */
export function toKpis(
  k: ApiKpis,
  audit: ApiAuditRecord[] = [],
  now: Date = new Date(),
): DisplayKpis {
  const autoPct = k.decisions ? toPct(k.automation_rate) : 0;
  return {
    activeAlerts: k.pending_reviews,
    decisions: k.decisions,
    autoPct,
    escalatedPct: k.decisions ? 100 - autoPct : 0,
    hoursSaved: null,
    decisionsToday: countOnDay(
      audit.map((r) => r.created_at),
      now,
    ),
    avgTimeToDecisionS: k.avg_time_to_decision_s ?? null,
    timedReviews: k.timed_reviews ?? 0,
  };
}

/** Demo-mode KPIs computed from the mock data with the same rules as toKpis. */
export function kpisFromDemo(
  alerts: Alert[],
  decisions: Decision[],
  now: Date = new Date(DEMO_NOW_MS),
): DisplayKpis {
  const auto = decisions.filter((d) => d.mode === "auto").length;
  const autoPct = decisions.length ? Math.round((auto / decisions.length) * 100) : 0;
  return {
    activeAlerts: alerts.filter((a) => a.status === "pending").length,
    decisions: decisions.length,
    autoPct,
    escalatedPct: decisions.length ? 100 - autoPct : 0,
    hoursSaved: null,
    // demo data is fixed in time, so "today" is the demo's own date
    decisionsToday: countOnDay(
      decisions.map((d) => d.timestamp),
      now,
    ),
    avgTimeToDecisionS: null,
    timedReviews: 0,
  };
}

// ---------- evaluation (GET /evaluation = results/summary.json) ----------

/** True when the payload has the summary.json shape the Evaluation page needs. */
export function isEvaluation(x: unknown): x is ApiEvaluation {
  const e = x as ApiEvaluation | null;
  return (
    !!e &&
    typeof e === "object" &&
    !!e.summary?.gate &&
    !!e.summary?.confidence_only_baseline &&
    !!e.summary?.all_options_stress_test?.gate &&
    Array.isArray(e.sweep_top1) &&
    Array.isArray(e.sweep_all_options)
  );
}

export const RETRIEVERS: ApiRetrieverName[] = ["tfidf", "chroma", "hybrid"];

export function isRetrievalComparison(x: unknown): x is ApiRetrievalComparison {
  const r = x as ApiRetrievalComparison | null;
  const ok = (b: ApiRetrievalBlock | undefined) =>
    !!b && !!b.random_baseline && RETRIEVERS.every((k) => typeof b[k]?.mrr === "number");
  return !!r && typeof r === "object" && ok(r.with_category_filter) && ok(r.without_filter);
}

/** One chart row per metric on a 0-100 scale: hit@k in percent, MRR x100 (labelled so). */
export function retrievalRows(block: ApiRetrievalBlock) {
  return (["hit@1", "hit@3", "mrr"] as const).map((m) => ({
    metric: m === "mrr" ? "MRR ×100" : m,
    tfidf: pct1(block.tfidf[m]),
    chroma: pct1(block.chroma[m]),
    hybrid: pct1(block.hybrid[m]),
    random: pct1(block.random_baseline[m]),
  }));
}

/** "hybrid · corpus v2 (56 docs)" from /health; null when the backend does not report it. */
export function retrievalLabel(h: ApiHealth | null): string | null {
  if (!h?.retriever || !h.corpus) return null;
  return `${h.retriever} · corpus ${h.corpus}${h.corpus_docs ? ` (${h.corpus_docs} docs)` : ""}`;
}

// ---------- Stage 8: independent evaluation (AI labels, LLM-as-judge, not humans) ----------

export function isAiEvaluation(x: unknown): x is ApiAiEvaluation {
  const r = x as ApiAiEvaluation | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.labels_source === "string" &&
    Array.isArray(r.limitations) &&
    typeof r.results?.gate?.decision_accuracy === "number" &&
    typeof r.results?.confidence_only?.decision_accuracy === "number" &&
    !!r.agreement?.overall?.correct_action &&
    !!r.agreement?.overall?.needs_human_review
  );
}

export const AI_EVAL_METRICS = [
  ["action_accuracy", "Action accuracy"],
  ["decision_accuracy", "Decision accuracy"],
  ["automation_rate", "Automation rate"],
  ["false_auto_execution_rate", "False auto-exec"],
  ["unnecessary_escalation_rate", "Unneeded escalation"],
] as const;

/** One chart row per metric, in percent (display only). */
export function aiEvalRows(block: ApiAiEvalBlock) {
  return AI_EVAL_METRICS.map(([k, label]) => ({
    metric: label,
    gate: pct1(block.gate[k]),
    baseline: pct1(block.confidence_only[k]),
  }));
}

export function isAiGeminiEvaluation(x: unknown): x is ApiAiGeminiEvaluation {
  const r = x as ApiAiGeminiEvaluation | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.run?.calls_used === "number" &&
    typeof r.comparison?.agreed_set?.rule?.gate?.decision_accuracy === "number" &&
    typeof r.comparison?.agreed_set?.gemini?.gate?.decision_accuracy === "number"
  );
}

/** One row per metric: rule Strategist vs Gemini Strategist, Decision Gate, in percent. */
export function aiCompareRows(c: ApiAiGeminiEvaluation["comparison"]) {
  return AI_EVAL_METRICS.map(([k, label]) => ({
    metric: label,
    rule: pct1(c.agreed_set.rule.gate[k]),
    gemini: pct1(c.agreed_set.gemini.gate[k]),
  }));
}

/** Kappa with 2 decimals; "undefined" when the backend could not compute it (null). */
export function fmtKappa(k: number | null | undefined): string {
  return typeof k === "number" ? k.toFixed(2) : "undefined";
}

/** "conflicting_signals" -> "Conflicting signals". */
export function caseTypeLabel(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rate 0-1 -> percent with one decimal (display only). */
export function pct1(x: number): number {
  return Math.round(x * 1000) / 10;
}

export type ParetoPoint = {
  threshold: number;
  /** % of decisions auto-executed */
  automation: number;
  /** % of decisions wrongly auto-executed */
  falseAuto: number;
};

/** Sweep -> chart points per policy: x = false auto-execution %, y = automation %. */
export function paretoSeries(sweep: ApiSweepPoint[]): {
  gate: ParetoPoint[];
  baseline: ParetoPoint[];
} {
  const pt = (threshold: number, m: ApiEvalMetrics): ParetoPoint => ({
    threshold,
    automation: pct1(m.automation_rate),
    falseAuto: pct1(m.false_auto_execution_rate),
  });
  return {
    gate: sweep.map((p) => pt(p.confidence_min, p.gate)),
    baseline: sweep.map((p) => pt(p.confidence_min, p.confidence_only)),
  };
}

/** The sweep point evaluated at exactly this confidence threshold (0-1), if there is one. */
export function sweepPointAt(sweep: ApiSweepPoint[], confidenceMin: number): ApiSweepPoint | null {
  return sweep.find((p) => Math.abs(p.confidence_min - confidenceMin) < 1e-9) ?? null;
}

// ---------- audit log sorting ----------

export type AuditSortKey =
  "id" | "category" | "action" | "route" | "human" | "cost" | "confidence" | "status";

/** Stable sort of display decisions by one column. Missing values sort last. */
export function sortDecisions(
  rows: Decision[],
  key: AuditSortKey,
  dir: "asc" | "desc",
): Decision[] {
  const val = (d: Decision): string | number | null => {
    switch (key) {
      case "id":
        return d.id;
      case "category":
        return d.category;
      case "action":
        return d.backendAction ?? d.action;
      case "route":
        return d.mode;
      case "human":
        return d.mode === "auto" ? "" : d.human;
      case "cost":
        return d.cost;
      case "confidence":
        return d.confidence;
      case "status":
        return d.status;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((d, i) => ({ d, i, v: val(d) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v));
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.d);
}
