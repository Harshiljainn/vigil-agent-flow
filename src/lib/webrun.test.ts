// Gemini quota and live-fetch summary helpers. Run with: bun test
import { describe, expect, test } from "bun:test";
import type { ApiAgentReasoning, ApiAlertView, ApiLiveRun, ApiLlmStatus } from "./api";
import { fallbackNotice, geminiQuota, summarizeLiveRun } from "./webrun";

const llm = (o: Partial<ApiLlmStatus>): ApiLlmStatus => ({
  available: true,
  reason: "ok",
  model: "m",
  calls_today: 4,
  daily_budget: 20,
  remaining: 16,
  ...o,
});

describe("geminiQuota", () => {
  test("shows the calls left", () => {
    expect(geminiQuota(llm({}))).toEqual({
      unavailable: false,
      label: "Gemini: 16 calls left today",
    });
    expect(geminiQuota(llm({ remaining: 1 })).label).toBe("Gemini: 1 call left today");
  });
  test("says new alerts use the rule fallback, with the reason", () => {
    const k = geminiQuota(llm({ available: false, reason: "no_key", remaining: 20 }));
    expect(k.unavailable).toBe(true);
    expect(k.label).toBe("Gemini unavailable — rule fallback (no API key on the server)");
    const b = geminiQuota(llm({ available: false, reason: "budget_used", remaining: 0 }));
    expect(b.unavailable).toBe(true);
    expect(b.label).toContain("4 of 20");
    expect(geminiQuota(null).label).toBe("Gemini: checking…");
  });
});

const prov = (fallback: boolean, reason: string | null = null) => ({
  backend: "gemini" as const,
  model: "m",
  fallback,
  fallback_reason: reason,
});
const reasoning = (s: ReturnType<typeof prov>, t: ReturnType<typeof prov>): ApiAgentReasoning => ({
  summary: "",
  reasoning: "",
  cited_doc_ids: [],
  strategist_rationale: "",
  ranking: [],
  votes: {},
  k: 3,
  samples: 3,
  agreement: 1,
  synthesizer: s,
  strategist: t,
});

describe("fallbackNotice", () => {
  test("null without fallback", () => {
    expect(fallbackNotice(reasoning(prov(false), prov(false)))).toBeNull();
    expect(fallbackNotice(null)).toBeNull();
  });
  test("names the agent and the reason", () => {
    const n = fallbackNotice(reasoning(prov(false), prov(true, "time_limit")));
    expect(n).toContain("Gemini unavailable — rule fallback");
    expect(n).toContain("Strategist (time_limit)");
    expect(n).not.toContain("Synthesizer");
  });
});

const view = (r: ApiAgentReasoning | null) => ({ reasoning: r }) as unknown as ApiAlertView;
const run = (o: Partial<ApiLiveRun>): ApiLiveRun => ({
  alerts: [],
  report: {
    checked_at: "2026-11-19T10:00:00+00:00",
    servers: [
      {
        name: "news-mcp",
        kind: "live",
        state: "failing",
        detail: "HTTP 429",
        checked_at: null,
        tools: [],
      },
    ],
    failed_servers: [],
    news: {
      fetched: 12,
      dropped_irrelevant: 5,
      dropped_duplicate: 2,
      kept_articles: 5,
      signals: 3,
    },
    weather_ports_checked: 6,
    weather_severe_ports: [],
    signals_received: 0,
    contradictions_added: 0,
    groups: 0,
    alerts_built: 0,
    skipped: [],
    rules: {},
  },
  ...o,
});

describe("summarizeLiveRun", () => {
  test("zero alerts and nothing failed is calm", () => {
    const s = summarizeLiveRun(run({}));
    expect(s).toMatchObject({
      portsChecked: 6,
      portsSevere: 0,
      newsFetched: 12,
      newsKept: 5,
      alertsCreated: 0,
      allCalm: true,
      cached: false,
    });
  });
  test("failed servers carry the reason and block 'calm'", () => {
    const r = run({});
    r.report.failed_servers = ["news-mcp"];
    r.report.news = null;
    const s = summarizeLiveRun(r);
    expect(s.failed).toEqual([{ name: "news-mcp", why: "HTTP 429" }]);
    expect(s.allCalm).toBe(false);
    expect(s.newsFetched).toBeNull();
  });
  test("cooldown result", () => {
    const s = summarizeLiveRun(run({ cached: true, next_fetch_in_s: 30 }));
    expect(s.cached).toBe(true);
    expect(s.nextFetchInS).toBe(30);
  });
  test("counts alerts whose Gemini reasoning fell back, with the reasons", () => {
    const alerts = [
      view(reasoning(prov(false), prov(true, "time_limit"))),
      view(reasoning(prov(false), prov(false))),
    ];
    const g = summarizeLiveRun(run({ alerts }));
    expect(g.geminiFallbacks).toEqual({ count: 1, reasons: ["time_limit"] });
  });
});
