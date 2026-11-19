/**
 * Pure helpers for the website's "Fetch live signals" control and the Gemini quota line.
 * Everything shown comes from the backend responses (/llm/status, /signals/live/run,
 * /scenarios/run); nothing is computed or invented here. Tested in webrun.test.ts.
 */
import type { ApiAgentReasoning, ApiLiveRun, ApiLlmStatus } from "./api";

export type GeminiQuota = {
  /** True when new alerts will use the rule fallback (no key, or budget used up). */
  unavailable: boolean;
  /** "Gemini: N calls left today", or why new alerts fall back to rules. */
  label: string;
};

export function geminiQuota(llm: ApiLlmStatus | null): GeminiQuota {
  if (llm === null) return { unavailable: false, label: "Gemini: checking…" };
  if (llm.reason === "no_key")
    return {
      unavailable: true,
      label: "Gemini unavailable — rule fallback (no API key on the server)",
    };
  if (llm.reason === "budget_used")
    return {
      unavailable: true,
      label: `Gemini unavailable — rule fallback (daily budget used up: ${llm.calls_today} of ${llm.daily_budget} calls; resets 00:00 UTC)`,
    };
  return {
    unavailable: false,
    label: `Gemini: ${llm.remaining} call${llm.remaining === 1 ? "" : "s"} left today`,
  };
}

/** Fallback to rules (Synthesizer and/or Strategist), with the backend's reason; null if none. */
export function fallbackNotice(r: ApiAgentReasoning | null | undefined): string | null {
  if (!r) return null;
  const parts: string[] = [];
  if (r.synthesizer.fallback)
    parts.push(`Synthesizer (${r.synthesizer.fallback_reason ?? "no reason given"})`);
  if (r.strategist.fallback)
    parts.push(`Strategist (${r.strategist.fallback_reason ?? "no reason given"})`);
  return parts.length ? `Gemini unavailable — rule fallback for: ${parts.join("; ")}.` : null;
}

export type LiveRunSummary = {
  portsChecked: number;
  portsSevere: number;
  severePorts: string[];
  /** null when the news server returned no counts (it failed). */
  newsFetched: number | null;
  newsKept: number | null;
  failed: { name: string; why: string }[];
  alertsCreated: number;
  /** "All monitored ports calm" case: no alert, nothing failed. */
  allCalm: boolean;
  cached: boolean;
  nextFetchInS: number | null;
  /** Alerts whose Gemini reasoning fell back to rules, with the distinct reasons. */
  geminiFallbacks: { count: number; reasons: string[] };
};

export function summarizeLiveRun(run: ApiLiveRun): LiveRunSummary {
  const { report } = run;
  const failed = report.failed_servers.map((name) => ({
    name,
    why: report.servers.find((s) => s.name === name)?.detail ?? "no detail",
  }));
  const reasons = new Set<string>();
  let count = 0;
  for (const a of run.alerts) {
    const r = a.reasoning;
    if (!r) continue;
    const fb = [r.synthesizer, r.strategist].filter((p) => p.fallback);
    if (fb.length) count += 1;
    for (const p of fb) if (p.fallback_reason) reasons.add(p.fallback_reason);
  }
  return {
    portsChecked: report.weather_ports_checked,
    portsSevere: report.weather_severe_ports.length,
    severePorts: report.weather_severe_ports,
    newsFetched: report.news ? report.news.fetched : null,
    newsKept: report.news ? report.news.kept_articles : null,
    failed,
    alertsCreated: run.alerts.length,
    allCalm:
      run.alerts.length === 0 && failed.length === 0 && report.weather_severe_ports.length === 0,
    cached: run.cached === true,
    nextFetchInS: run.next_fetch_in_s ?? null,
    geminiFallbacks: { count, reasons: [...reasons] },
  };
}
