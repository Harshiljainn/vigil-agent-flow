// Run with: bun test   (Bun's built-in runner; no extra dependency)
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTION_TYPE_BY_BACKEND,
  isEvaluation,
  kpisFromDemo,
  paretoSeries,
  sortDecisions,
  sweepPointAt,
  toActionType,
  toAlert,
  toCategory,
  toDecisions,
  toKpis,
  toPct,
  toStatus,
  toThresholds,
} from "./adapter";
import type { ApiAlertView, ApiAuditRecord, ApiEvaluation, ApiKpis } from "./api";
import type { Decision } from "../data/vigilai";

const TH = { cost_limit_usd: 12000, confidence_min: 0.78, require_reversible: true };

// Shape copied from a real GET /alerts response (ALT-0040), trimmed.
const VIEW: ApiAlertView = {
  alert: {
    id: "ALT-0040",
    category: "shipment_telemetry",
    severity: "critical",
    confidence: 0.9678,
    affected_shipments: 1,
    supplier: null,
    signals: [
      {
        source: "weather-mcp",
        category: "shipment_telemetry",
        summary: "reefer temperature drift on container",
        reliability: 0.834,
        supports: true,
      },
      {
        source: "news-mcp",
        category: "shipment_telemetry",
        summary: "no anomaly reported",
        reliability: 0.5,
        supports: false,
      },
    ],
    evidence: [
      {
        doc_id: "SOP-TEL-01",
        title: "Reefer and telemetry anomaly SOP",
        kind: "playbook",
        snippet: "alert the carrier",
        score: 0.4,
      },
    ],
    grounded: true,
  },
  options: [
    {
      action: "alert_carrier_check_container",
      description: "Alert carrier and request a container check",
      cost_usd: 150,
      delay_hours: 12,
      reversible: true,
      confidence: 0.9678,
      source_docs: ["SOP-TEL-01"],
    },
    {
      action: "dispose_cargo",
      description: "Dispose of compromised cargo",
      cost_usd: 8000,
      delay_hours: 0,
      reversible: false,
      confidence: 0.7936,
      source_docs: [],
    },
  ],
  chosen: {
    action: "dispose_cargo",
    description: "Dispose of compromised cargo",
    cost_usd: 8000,
    delay_hours: 0,
    reversible: false,
    confidence: 0.7936,
    source_docs: [],
  },
  decision: { route: "human_review", reasons: ["action is irreversible"], thresholds: TH },
  audit_seq: 40,
  status: "pending_review",
};

function rec(p: Partial<ApiAuditRecord> & { seq: number }): ApiAuditRecord {
  return {
    alert_id: "ALT-0001",
    category: "supplier_risk",
    action: "switch_supplier",
    cost_usd: 15000,
    confidence: 0.81,
    reversible: false,
    route: "human_review",
    reasons: ["action is irreversible"],
    actor: "system",
    status: "pending_review",
    thresholds: TH,
    evidence_ids: [],
    review_of: null,
    note: null,
    override: false,
    recommended_action: null,
    ...p,
  };
}

describe("categories and confidence", () => {
  test("renamed categories follow the CLAUDE.md table", () => {
    expect(toCategory("supplier_risk")).toBe("supplier");
    expect(toCategory("shipment_telemetry")).toBe("telemetry");
    expect(toCategory("weather")).toBe("weather");
    expect(toCategory("cyber")).toBe("cyber");
  });
  test("confidence 0-1 -> 0-100 integer", () => {
    expect(toPct(0.78)).toBe(78);
    expect(toPct(0.9678)).toBe(97);
    expect(toPct(0)).toBe(0);
    expect(toPct(1)).toBe(100);
  });
  test("thresholds", () => {
    expect(toThresholds(TH)).toEqual({ cost: 12000, confidence: 78 });
  });
});

describe("actions", () => {
  test("every backend action in actions.json has a mapping", () => {
    const p = join(import.meta.dir, "../../../backend/vigilai/knowledge/actions.json");
    if (!existsSync(p)) return; // backend not checked out next to frontend
    const catalogue = JSON.parse(readFileSync(p, "utf8")) as Record<string, { action: string }[]>;
    const names = Object.values(catalogue).flatMap((opts) => opts.map((o) => o.action));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(ACTION_TYPE_BY_BACKEND[n]).toBeDefined();
  });
  test("unknown action falls back to notify_only", () => {
    expect(toActionType("something_new")).toBe("notify_only");
    expect(toActionType("reroute_shipment")).toBe("reroute");
  });
});

describe("statuses", () => {
  test("strips the (simulated) suffix", () => {
    expect(toStatus("auto_executed(simulated)")).toBe("auto_executed");
    expect(toStatus("approved(simulated)")).toBe("approved");
    expect(toStatus("rejected(simulated)")).toBe("rejected");
    expect(toStatus("pending_review")).toBe("pending");
  });
});

describe("toAlert", () => {
  const a = toAlert(VIEW);
  test("core fields", () => {
    expect(a.id).toBe("ALT-0040");
    expect(a.category).toBe("telemetry");
    expect(a.confidence).toBe(97);
    expect(a.status).toBe("pending");
    expect(a.auditSeq).toBe(40);
    expect(a.shipmentCount).toBe(1);
    expect(a.shipments).toEqual([]);
    expect(a.supplier).toBe("—");
    expect(a.createdAt).toBe("");
    expect(a.summary).toBe("Reefer temperature drift on container");
    expect(a.gateReasons).toEqual(["action is irreversible"]);
  });
  test("options keep backend name, reversibility, delay and confidence", () => {
    expect(a.options).toHaveLength(2);
    const [o1, o2] = a.options;
    expect(o1!.action).toBe("notify_only");
    expect(o1!.backendAction).toBe("alert_carrier_check_container");
    expect(o1!.reversible).toBe(true);
    expect(o1!.delayHours).toBe(12);
    expect(o2!.action).toBe("force_majeure");
    expect(o2!.reversible).toBe(false);
    expect(o2!.confidence).toBe(79);
  });
  test("recommended option is the backend's chosen option", () => {
    expect(a.recommendedOptionId).toBe(a.options[1]!.id);
  });
  test("evidence: signals are live, retrieved docs are grounded", () => {
    expect(a.evidence.map((e) => e.grounded)).toEqual([false, false, true]);
    expect(a.evidence[1]!.text).toContain("contradicting");
    expect(a.evidence[2]!.agent).toBe("SOP-TEL-01");
  });
});

describe("toDecisions", () => {
  const audit = [
    rec({ seq: 1, route: "auto_execute", actor: "system", status: "auto_executed(simulated)" }),
    rec({ seq: 2 }),
    rec({ seq: 3 }),
    rec({ seq: 4, review_of: 2, actor: "R. Iyer", status: "approved(simulated)" }),
    rec({
      seq: 5,
      review_of: 3,
      actor: "S. Fernandes",
      status: "approved(simulated)",
      note: "cheaper and reversible",
      // Modify & Approve: the review record carries the chosen option's own values
      action: "qualify_backup_supplier",
      cost_usd: 9000,
      confidence: 0.75,
      reversible: true,
      override: true,
      recommended_action: "switch_supplier",
    }),
  ];
  const ds = toDecisions(audit);
  test("one row per gate decision, newest first", () => {
    expect(ds.map((d) => d.id)).toEqual(["DEC-0003", "DEC-0002", "DEC-0001"]);
  });
  test("auto row", () => {
    const d = ds[2]!;
    expect(d.mode).toBe("auto");
    expect(d.human).toBeNull();
    expect(d.status).toBe("auto_executed");
    expect(d.category).toBe("supplier");
    expect(d.confidence).toBe(81);
  });
  test("review merged into its gate row", () => {
    const d = ds[1]!;
    expect(d.mode).toBe("human");
    expect(d.human).toBe("R. Iyer");
    expect(d.status).toBe("approved");
    expect(d.override).toBeUndefined();
  });
  test("override shows the chosen option's real action, cost, confidence, reversibility", () => {
    const d = ds[0]!;
    expect(d.override).toEqual({
      recommended: "switch_supplier",
      chosen: "qualify_backup_supplier",
    });
    expect(d.backendAction).toBe("qualify_backup_supplier");
    expect(d.action).toBe("split_order");
    expect(d.cost).toBe(9000);
    expect(d.confidence).toBe(75);
    expect(d.reversible).toBe(true);
    expect(d.note).toBe("cheaper and reversible");
  });
  test("a note alone is never treated as an override", () => {
    const [d] = toDecisions([
      rec({ seq: 1 }),
      rec({
        seq: 2,
        review_of: 1,
        status: "approved(simulated)",
        note: "override: approved x instead of recommended y",
      }),
    ]);
    expect(d!.override).toBeUndefined();
    expect(d!.backendAction).toBe("switch_supplier");
    expect(d!.cost).toBe(15000);
  });
});

describe("KPIs agree with each other", () => {
  const k: ApiKpis = {
    total_alerts: 40,
    active_alerts: 23,
    decisions: 40,
    auto_executed: 17,
    escalated: 23,
    automation_rate: 0.425,
    escalation_rate: 0.575,
    pending_reviews: 23,
    reviews_done: 0,
  };
  test("live", () => {
    const d = toKpis(k);
    expect(d.activeAlerts).toBe(23);
    expect(d.decisions).toBe(40);
    expect(d.autoPct + d.escalatedPct).toBe(100);
    expect(d.hoursSaved).toBeNull();
  });
  test("zero decisions does not divide by zero", () => {
    const d = toKpis({ ...k, decisions: 0, automation_rate: 0 });
    expect(d.autoPct).toBe(0);
    expect(d.escalatedPct).toBe(0);
  });
  test("demo uses the same rules", () => {
    const d = kpisFromDemo([toAlert(VIEW)], toDecisions([rec({ seq: 1 })]));
    expect(d.activeAlerts).toBe(1);
    expect(d.decisions).toBe(1);
    expect(d.autoPct + d.escalatedPct).toBe(100);
  });
});

describe("evaluation (summary.json)", () => {
  const m = (auto: number, falseAuto: number) => ({
    n: 10,
    decision_accuracy: 0.5,
    automation_rate: auto,
    human_review_workload: 1 - auto,
    false_auto_execution_rate: falseAuto,
    false_auto_among_auto: 0,
    unnecessary_escalation_rate: 0,
  });
  const sweep = [
    { confidence_min: 0.5, gate: m(0.7417, 0.2625), confidence_only: m(0.7542, 0.275) },
    { confidence_min: 0.78, gate: m(0.4875, 0.1333), confidence_only: m(0.4958, 0.1417) },
  ];
  test("pareto series: x = false auto %, y = automation %, one point per threshold", () => {
    const s = paretoSeries(sweep);
    expect(s.gate).toEqual([
      { threshold: 0.5, automation: 74.2, falseAuto: 26.3 },
      { threshold: 0.78, automation: 48.8, falseAuto: 13.3 },
    ]);
    expect(s.baseline[1]).toEqual({ threshold: 0.78, automation: 49.6, falseAuto: 14.2 });
  });
  test("current threshold is marked only when it was swept", () => {
    expect(sweepPointAt(sweep, 78 / 100)?.confidence_min).toBe(0.78);
    expect(sweepPointAt(sweep, 0.8)).toBeNull();
  });
  test("isEvaluation rejects other shapes", () => {
    expect(isEvaluation(null)).toBe(false);
    expect(isEvaluation({ summary: {} })).toBe(false);
  });
  test("real backend summary.json is accepted and has the per-category breakdown", () => {
    const p = join(import.meta.dir, "../../../backend/results/summary.json");
    if (!existsSync(p)) return; // backend not checked out next to frontend
    const e = JSON.parse(readFileSync(p, "utf8")) as ApiEvaluation;
    expect(isEvaluation(e)).toBe(true);
    expect(e.summary.note).toContain("SYNTHETIC");
    expect(sweepPointAt(e.sweep_top1, 0.78)?.gate).toEqual(e.summary.gate);
    const top1 = Object.values(e.by_category!.top1);
    expect(top1.reduce((n, c) => n + c.gate.n, 0)).toBe(e.summary.gate.n);
  });
});

describe("audit sorting", () => {
  const d = (id: string, cost: number, human: string | null, mode: "auto" | "human"): Decision => ({
    id,
    alertId: "A",
    timestamp: "",
    category: "weather",
    action: "reroute",
    mode,
    human,
    cost,
    confidence: 80,
    status: mode === "auto" ? "auto_executed" : "pending",
    outcome: "pending",
  });
  const rows = [
    d("DEC-2", 500, null, "human"),
    d("DEC-1", 900, "R", "human"),
    d("DEC-3", 100, null, "auto"),
  ];
  test("numeric asc / desc", () => {
    expect(sortDecisions(rows, "cost", "asc").map((r) => r.id)).toEqual([
      "DEC-3",
      "DEC-2",
      "DEC-1",
    ]);
    expect(sortDecisions(rows, "cost", "desc").map((r) => r.id)).toEqual([
      "DEC-1",
      "DEC-2",
      "DEC-3",
    ]);
  });
  test("string sort; missing values last in both directions", () => {
    expect(sortDecisions(rows, "id", "asc").map((r) => r.id)).toEqual(["DEC-1", "DEC-2", "DEC-3"]);
    expect(sortDecisions(rows, "human", "asc").map((r) => r.id)).toEqual([
      "DEC-3",
      "DEC-1",
      "DEC-2",
    ]);
    expect(sortDecisions(rows, "human", "desc").map((r) => r.id)).toEqual([
      "DEC-1",
      "DEC-3",
      "DEC-2",
    ]);
  });
  test("does not mutate the input", () => {
    sortDecisions(rows, "cost", "asc");
    expect(rows.map((r) => r.id)).toEqual(["DEC-2", "DEC-1", "DEC-3"]);
  });
});
