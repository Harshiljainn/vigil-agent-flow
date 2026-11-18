/**
 * Converts backend API data (src/lib/api.ts) into the shapes the existing pages use
 * (src/data/vigilai.ts). The backend is the source of truth; this file only converts
 * for display. See the mismatch table in the project CLAUDE.md.
 */
import type {
  ApiAlertView,
  ApiAuditRecord,
  ApiCategory,
  ApiKpis,
  ApiMitigationOption,
  ApiThresholds,
} from "./api";
import type {
  ActionType,
  Alert,
  Category,
  Decision,
  Evidence,
  MitigationOption,
  Status,
} from "../data/vigilai";

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

// ---------- reviewer override ("Modify & Approve") ----------

/** The backend review has no option field, so an override is recorded in the note. */
export function overrideNote(recommended: string, chosen: string): string {
  return `override: approved ${chosen} instead of recommended ${recommended}`;
}

export function parseOverride(
  note: string | null | undefined,
): { recommended: string; chosen: string } | null {
  const m = note?.match(/^override: approved (\S+) instead of recommended (\S+)/);
  return m ? { chosen: m[1]!, recommended: m[2]! } : null;
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
    createdAt: "", // backend has no timestamps yet (database stage)
    status: toStatus(v.status),
    shipments: [], // backend gives a count, not IDs
    shipmentCount: a.affected_shipments,
    supplier: a.supplier ?? "—",
    evidence,
    options,
    recommendedOptionId: options[chosenIdx >= 0 ? chosenIdx : 0]?.id ?? "",
    auditSeq: v.audit_seq,
    gateReasons: v.decision.reasons,
  };
}

// ---------- audit -> decisions ----------

/**
 * One Decision per gate record. A human review is a separate backend audit row
 * (review_of = gate seq); it is merged into its gate row here: approver = reviewer,
 * status = verdict, and an override recorded in the note becomes `override`.
 */
export function toDecisions(audit: ApiAuditRecord[]): Decision[] {
  const reviews = new Map<number, ApiAuditRecord>();
  for (const r of audit) if (r.review_of !== null) reviews.set(r.review_of, r);

  return audit
    .filter((r) => r.review_of === null)
    .sort((a, b) => b.seq - a.seq)
    .map((g) => {
      const review = reviews.get(g.seq);
      const override = parseOverride(review?.note);
      const backendAction = override?.chosen ?? g.action;
      const d: Decision = {
        id: `DEC-${String(g.seq).padStart(4, "0")}`,
        alertId: g.alert_id,
        timestamp: "", // backend has no timestamps yet (database stage)
        category: toCategory(g.category),
        action: toActionType(backendAction),
        mode: g.route === "auto_execute" ? "auto" : "human",
        human: review ? review.actor : null,
        cost: g.cost_usd,
        confidence: toPct(g.confidence),
        status: toStatus(review ? review.status : g.status),
        outcome: "pending", // no per-decision ground truth from the API
        backendAction,
      };
      if (override) d.override = override;
      if (review?.note) d.note = review.note;
      return d;
    });
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
};

/** Live KPIs: all from one /kpis response. Escalated% = 100 - Auto% so the two always agree. */
export function toKpis(k: ApiKpis): DisplayKpis {
  const autoPct = k.decisions ? toPct(k.automation_rate) : 0;
  return {
    activeAlerts: k.pending_reviews,
    decisions: k.decisions,
    autoPct,
    escalatedPct: k.decisions ? 100 - autoPct : 0,
    hoursSaved: null,
  };
}

/** Demo-mode KPIs computed from the mock data with the same rules as toKpis. */
export function kpisFromDemo(alerts: Alert[], decisions: Decision[]): DisplayKpis {
  const auto = decisions.filter((d) => d.mode === "auto").length;
  const autoPct = decisions.length ? Math.round((auto / decisions.length) * 100) : 0;
  return {
    activeAlerts: alerts.filter((a) => a.status === "pending").length,
    decisions: decisions.length,
    autoPct,
    escalatedPct: decisions.length ? 100 - autoPct : 0,
    hoursSaved: null,
  };
}
