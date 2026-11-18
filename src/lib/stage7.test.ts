// Stage 7: timestamps, Decisions Today, date-range filter, time-to-decision, session expiry.
// Run with: bun test
import { describe, expect, test } from "bun:test";
import {
  countOnDay,
  inDateRange,
  kpisFromDemo,
  localDateKey,
  sameLocalDay,
  sessionExpired,
  toAlert,
  toDecisions,
  toKpis,
} from "./adapter";
import type { ApiAlertView, ApiAuditRecord, ApiKpis } from "./api";
import { alertAge, formatDateTime, formatDuration, timeAgo } from "../components/bits";
import { DEMO_NOW_MS, type Decision } from "../data/vigilai";

const TH = { cost_limit_usd: 12000, confidence_min: 0.78, require_reversible: true };

function rec(over: Partial<ApiAuditRecord>): ApiAuditRecord {
  return {
    seq: 1,
    alert_id: "ALT-0001",
    category: "supplier_risk",
    action: "switch_supplier",
    cost_usd: 15000,
    confidence: 0.81,
    reversible: false,
    route: "human_review",
    reasons: [],
    actor: "system",
    status: "pending_review",
    thresholds: TH,
    evidence_ids: [],
    review_of: null,
    note: null,
    override: false,
    recommended_action: null,
    ...over,
  };
}

const K: ApiKpis = {
  total_alerts: 40,
  active_alerts: 23,
  decisions: 40,
  auto_executed: 17,
  escalated: 23,
  automation_rate: 0.425,
  escalation_rate: 0.575,
  pending_reviews: 23,
  reviews_done: 2,
  avg_time_to_decision_s: 95.5,
  timed_reviews: 2,
};

/** A local-time instant, so the tests mean the same thing in every time zone. */
const local = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("timestamps from the backend", () => {
  test("alert createdAt comes from AlertView.created_at", () => {
    const view = {
      alert: {
        id: "ALT-0001",
        category: "weather",
        severity: "high",
        confidence: 0.8,
        affected_shipments: 2,
        supplier: null,
        signals: [],
        evidence: [],
        grounded: false,
      },
      options: [
        {
          action: "reroute_shipment",
          description: "x",
          cost_usd: 1,
          delay_hours: 1,
          reversible: true,
          confidence: 0.8,
          source_docs: [],
        },
      ],
      chosen: {
        action: "reroute_shipment",
        description: "x",
        cost_usd: 1,
        delay_hours: 1,
        reversible: true,
        confidence: 0.8,
        source_docs: [],
      },
      decision: { route: "auto_execute", reasons: [], thresholds: TH },
      audit_seq: 1,
      status: "auto_executed(simulated)",
      created_at: "2026-11-18T09:30:00.123Z",
    } as unknown as ApiAlertView;
    expect(toAlert(view).createdAt).toBe("2026-11-18T09:30:00.123Z");
    expect(toAlert({ ...view, created_at: undefined }).createdAt).toBe("");
  });

  test("decision row: gate time, review time and time-to-decision", () => {
    const [d] = toDecisions([
      rec({ seq: 1, created_at: "2026-11-18T09:00:00.000Z" }),
      rec({
        seq: 2,
        review_of: 1,
        actor: "rev.one",
        status: "approved(simulated)",
        created_at: "2026-11-18T09:02:05.000Z",
        time_to_decision_s: 125,
      }),
    ]);
    expect(d!.timestamp).toBe("2026-11-18T09:00:00.000Z");
    expect(d!.reviewedAt).toBe("2026-11-18T09:02:05.000Z");
    expect(d!.timeToDecisionS).toBe(125);
  });

  test("records without timestamps (older data) still convert", () => {
    const [d] = toDecisions([rec({ seq: 1 })]);
    expect(d!.timestamp).toBe("");
    expect(d!.reviewedAt).toBeUndefined();
    expect(d!.timeToDecisionS).toBeUndefined();
  });
});

describe("Decisions Today", () => {
  const now = local(2026, 11, 18, 15);
  test("counts gate decisions and reviews stored on today's local date", () => {
    const audit = [
      rec({ seq: 1, created_at: local(2026, 11, 18, 0, 5).toISOString() }),
      rec({ seq: 2, created_at: local(2026, 11, 18, 23, 59).toISOString() }),
      rec({ seq: 3, review_of: 1, created_at: local(2026, 11, 18, 9).toISOString() }),
      rec({ seq: 4, created_at: local(2026, 11, 17, 23, 59).toISOString() }),
      rec({ seq: 5, created_at: null }),
    ];
    expect(toKpis(K, audit, now).decisionsToday).toBe(3);
  });
  test("countOnDay skips empty and invalid timestamps", () => {
    expect(countOnDay(["", null, undefined, "not a date"], now)).toBe(0);
  });
  test("sameLocalDay", () => {
    expect(sameLocalDay(local(2026, 1, 2, 0, 0), local(2026, 1, 2, 23, 59))).toBe(true);
    expect(sameLocalDay(local(2026, 1, 2), local(2026, 1, 3))).toBe(false);
  });
  test("demo counts against the demo's fixed date", () => {
    const d: Decision = {
      id: "DEC-1",
      alertId: "ALT-1",
      timestamp: new Date(DEMO_NOW_MS - 60_000).toISOString(),
      category: "weather",
      action: "reroute",
      mode: "auto",
      human: null,
      cost: 1,
      confidence: 90,
      status: "auto_executed",
      outcome: "pending",
    };
    const old = {
      ...d,
      id: "DEC-2",
      timestamp: new Date(DEMO_NOW_MS - 3 * 86_400_000).toISOString(),
    };
    expect(kpisFromDemo([], [d, old]).decisionsToday).toBe(1);
  });
});

describe("average time to decision", () => {
  test("taken from /kpis", () => {
    const k = toKpis(K);
    expect(k.avgTimeToDecisionS).toBe(95.5);
    expect(k.timedReviews).toBe(2);
  });
  test("null when there are no timed reviews or an older backend", () => {
    const { avg_time_to_decision_s: _a, timed_reviews: _t, ...old } = K;
    expect(toKpis(old).avgTimeToDecisionS).toBeNull();
    expect(toKpis(old).timedReviews).toBe(0);
  });
  test("formatDuration", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(42.4)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(2 * 3600 + 10 * 60)).toBe("2h 10m");
    expect(formatDuration(28 * 3600)).toBe("1d 4h");
  });
});

describe("audit date-range filter", () => {
  const ts = local(2026, 11, 18, 10).toISOString();
  test("no range keeps everything, even rows without a time", () => {
    expect(inDateRange(ts, "", "")).toBe(true);
    expect(inDateRange("", "", "")).toBe(true);
  });
  test("inclusive on both ends, by local date", () => {
    expect(inDateRange(ts, "2026-11-18", "2026-11-18")).toBe(true);
    expect(inDateRange(ts, "2026-11-19", "")).toBe(false);
    expect(inDateRange(ts, "", "2026-11-17")).toBe(false);
    expect(inDateRange(ts, "2026-11-01", "")).toBe(true);
  });
  test("a row without a time is dropped once a range is set", () => {
    expect(inDateRange("", "2026-11-01", "")).toBe(false);
  });
  test("localDateKey", () => {
    expect(localDateKey(local(2026, 3, 7, 23, 30))).toBe("2026-03-07");
  });
});

describe("display times", () => {
  test("backend alerts use real time, demo alerts the demo clock", () => {
    const now = Date.parse("2026-11-18T10:00:00Z");
    expect(alertAge({ createdAt: "2026-11-18T09:55:00Z", auditSeq: 3 }, now)).toBe("5m ago");
    const demo = new Date(DEMO_NOW_MS - 2 * 3600_000).toISOString();
    expect(alertAge({ createdAt: demo, auditSeq: undefined }, now)).toBe("2h ago");
  });
  test("timeAgo edge cases", () => {
    expect(timeAgo("")).toBe("—");
    expect(timeAgo("garbage")).toBe("—");
    expect(timeAgo(new Date(DEMO_NOW_MS - 10_000).toISOString())).toBe("just now");
  });
  test("formatDateTime is local and handles missing values", () => {
    expect(formatDateTime(local(2026, 11, 18, 14, 5).toISOString())).toBe("2026-11-18 14:05");
    expect(formatDateTime(null)).toBe("—");
  });
});

describe("session expiry", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  test("expired, valid and malformed", () => {
    expect(sessionExpired("2026-11-18T09:59:59.000Z", now)).toBe(true);
    expect(sessionExpired("2026-11-18T10:00:00.000Z", now)).toBe(true);
    expect(sessionExpired("2026-11-18T18:00:00.000Z", now)).toBe(false);
    expect(sessionExpired("nonsense", now)).toBe(true);
  });
});
