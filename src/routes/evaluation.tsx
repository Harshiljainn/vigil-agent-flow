import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical, ServerOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard, PageHeading } from "@/components/bits";
import { CATEGORY_META } from "@/data/vigilai";
import {
  ApiError,
  api,
  type ApiAiEvaluation,
  type ApiCategory,
  type ApiEvalMetrics,
  type ApiEvaluation,
  type ApiRetrievalComparison,
} from "@/lib/api";
import {
  RETRIEVERS,
  aiEvalRows,
  caseTypeLabel,
  fmtKappa,
  isAiEvaluation,
  isEvaluation,
  isRetrievalComparison,
  paretoSeries,
  pct1,
  retrievalLabel,
  retrievalRows,
  sweepPointAt,
  toCategory,
} from "@/lib/adapter";
import { cn } from "@/lib/utils";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation — VigilAI" },
      {
        name: "description",
        content:
          "Decision Gate vs confidence-only baseline on synthetic scenarios, with a confidence-threshold sweep, a TF-IDF vs ChromaDB vs hybrid retrieval comparison, and an independent set labelled by two AI models (LLM-as-judge, not humans).",
      },
      { property: "og:title", content: "Evaluation — VigilAI" },
      {
        property: "og:description",
        content: "Synthetic-scenario evaluation of the VigilAI Decision Gate.",
      },
    ],
  }),
  component: Evaluation,
});

const tt = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
};

/** Display a 0-1 rate as a percent with one decimal, e.g. 0.57 -> "57.0". */
const fmt = (x: number) => pct1(x).toFixed(1);

const GATE_COLOR = "var(--primary)";
const BASE_COLOR = "var(--warn)";

type Scope = "top1" | "all";
type CatMetric = "decision_accuracy" | "automation_rate" | "false_auto_execution_rate";

const METRIC_ROWS: { key: keyof ApiEvalMetrics; label: string; better: "up" | "down" }[] = [
  { key: "decision_accuracy", label: "Decision accuracy", better: "up" },
  { key: "automation_rate", label: "Automation rate", better: "up" },
  { key: "false_auto_execution_rate", label: "False auto-execution rate", better: "down" },
  { key: "false_auto_among_auto", label: "False auto among auto-executed", better: "down" },
  { key: "unnecessary_escalation_rate", label: "Unnecessary escalation rate", better: "down" },
  { key: "human_review_workload", label: "Human review workload", better: "down" },
];

const CAT_METRICS: { key: CatMetric; label: string }[] = [
  { key: "decision_accuracy", label: "Decision accuracy" },
  { key: "automation_rate", label: "Automation rate" },
  { key: "false_auto_execution_rate", label: "False auto-execution rate" },
];

function Evaluation() {
  const { mode, serverThresholds } = useVigil();
  const [data, setData] = useState<ApiEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("top1");
  const [catMetric, setCatMetric] = useState<CatMetric>("decision_accuracy");

  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    api
      .evaluation()
      .then((raw) => {
        if (cancelled) return;
        if (isEvaluation(raw)) {
          setData(raw);
          setError(null);
        } else setError("GET /evaluation returned an unexpected shape.");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "results/summary.json not found. Run `python -m vigilai.evaluate` in backend/."
            : e instanceof Error
              ? e.message
              : String(e),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const heading = (
    <PageHeading
      title="Evaluation"
      subtitle="Decision Gate vs a confidence-only baseline, from backend results/summary.json."
      actions={
        data && mode === "live" ? (
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            {(
              [
                ["top1", "Top-1 option"],
                ["all", "All options (stress test)"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={cn(
                  "rounded-md px-3 py-1",
                  scope === k ? "bg-primary text-primary-foreground" : "hover:bg-surface-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : undefined
      }
    />
  );

  if (mode === "demo") {
    return (
      <div>
        {heading}
        <div className="panel flex items-start gap-3 p-5">
          <ServerOff className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div>
            <p className="font-medium">No backend — evaluation results unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This page only shows numbers from the backend's evaluation run (GET /evaluation).
              Start the backend (
              <code className="font-mono">uvicorn vigilai.api:app --port 8000</code>) to see them.
              No demo numbers are shown here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {heading}
        <div className="panel p-5 text-sm">
          <p className="font-medium text-destructive">Could not load evaluation results</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        {heading}
        <div className="panel p-5 text-sm text-muted-foreground">Loading evaluation results…</div>
      </div>
    );
  }

  const s = data.summary;
  const gate = scope === "top1" ? s.gate : s.all_options_stress_test.gate;
  const base =
    scope === "top1"
      ? s.confidence_only_baseline
      : s.all_options_stress_test.confidence_only_baseline;
  const sweep = scope === "top1" ? data.sweep_top1 : data.sweep_all_options;
  const series = paretoSeries(sweep);
  const current = serverThresholds ? serverThresholds.confidence / 100 : null;
  const currentPoint = current === null ? null : sweepPointAt(sweep, current);
  const scopeLabel =
    scope === "top1"
      ? "Strategist's top-1 option per alert"
      : "Every candidate option (stress test of the gate itself)";

  const breakdown = data.by_category?.[scope === "top1" ? "top1" : "all_options"];
  const catRows = breakdown
    ? (Object.keys(breakdown) as ApiCategory[]).map((c) => ({
        name: CATEGORY_META[toCategory(c)].label,
        n: breakdown[c]!.gate.n,
        gate: pct1(breakdown[c]!.gate[catMetric]),
        baseline: pct1(breakdown[c]!.confidence_only[catMetric]),
      }))
    : [];

  return (
    <div>
      {heading}

      <div
        className="mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm"
        style={{
          borderColor: "color-mix(in oklab, var(--warn) 45%, transparent)",
          backgroundColor: "color-mix(in oklab, var(--warn) 10%, transparent)",
        }}
      >
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div>
          <p className="font-semibold text-warn">Synthetic scenarios — not real-world results</p>
          <p className="mt-0.5 text-muted-foreground">
            All numbers come from simulated scenarios with simulated ground truth (backend note: "
            {s.note}"). They show how the gate logic behaves, not how it performs on real
            disruptions.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Gate decision accuracy"
          value={`${fmt(gate.decision_accuracy)}%`}
          hint={`Baseline ${fmt(base.decision_accuracy)}% · n=${gate.n}`}
        />
        <KpiCard
          label="Gate false auto-execution"
          value={`${fmt(gate.false_auto_execution_rate)}%`}
          hint={`Baseline ${fmt(base.false_auto_execution_rate)}% (lower is better)`}
        />
        <KpiCard
          label="Gate automation rate"
          value={`${fmt(gate.automation_rate)}%`}
          hint={`Baseline ${fmt(base.automation_rate)}%`}
        />
        <KpiCard
          label="Strategist action accuracy"
          value={`${fmt(s.pipeline_action_accuracy)}%`}
          hint="Top-1 option = simulated correct action"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="panel overflow-x-auto p-0 lg:col-span-2">
          <p className="px-4 pt-4 text-sm font-medium">Gate vs baseline</p>
          <p className="px-4 text-xs text-muted-foreground">
            {scopeLabel} · n={gate.n} · thresholds cost ≤ 12,000 USD, confidence ≥ 0.78
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Metric</th>
                <th>Gate</th>
                <th className="pr-3">Baseline</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map(({ key, label, better }) => {
                const g = gate[key];
                const b = base[key];
                const gateBetter = better === "up" ? g > b : g < b;
                return (
                  <tr key={key} className="border-b border-border/60">
                    <td className="p-3">
                      {label}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {better === "up" ? "↑" : "↓"}
                      </span>
                    </td>
                    <td className={cn("font-mono", gateBetter && "text-ok")}>{fmt(g)}%</td>
                    <td className="pr-3 font-mono">{fmt(b)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            ↑ higher is better, ↓ lower is better. Green = gate better than baseline.
          </p>
        </div>

        <div className="panel p-4 lg:col-span-3">
          <p className="text-sm font-medium">
            Threshold sweep — automation rate vs false auto-execution rate
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Each point is one confidence threshold ({sweep.map((p) => p.confidence_min).join(", ")}
            ). Up and to the left is better.{" "}
            {current === null
              ? ""
              : currentPoint
                ? `Ringed points = current threshold ${current}.`
                : `Current threshold ${current} was not part of the sweep, so it is not marked.`}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="falseAuto"
                unit="%"
                domain={[0, "auto"]}
                stroke="var(--muted-foreground)"
                fontSize={11}
                label={{
                  value: "False auto-execution rate (%)",
                  position: "insideBottom",
                  offset: -10,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <YAxis
                type="number"
                dataKey="automation"
                unit="%"
                domain={[0, 100]}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <Tooltip
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as
                    { threshold: number; automation: number; falseAuto: number } | undefined;
                  if (!p) return null;
                  return (
                    <div style={{ ...tt, padding: 8 }}>
                      <p className="font-medium">{payload?.[0]?.name}</p>
                      <p>confidence ≥ {p.threshold}</p>
                      <p>automation {p.automation}%</p>
                      <p>false auto-execution {p.falseAuto}%</p>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
              <Line
                data={series.gate}
                dataKey="automation"
                name="Decision Gate"
                stroke={GATE_COLOR}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
              <Line
                data={series.baseline}
                dataKey="automation"
                name="Confidence-only baseline"
                stroke={BASE_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
              {currentPoint && (
                <ReferenceDot
                  x={pct1(currentPoint.gate.false_auto_execution_rate)}
                  y={pct1(currentPoint.gate.automation_rate)}
                  r={8}
                  fill="none"
                  stroke={GATE_COLOR}
                  strokeWidth={2}
                  label={{
                    value: `current ${current}`,
                    position: "top",
                    fontSize: 11,
                    fill: "var(--foreground)",
                  }}
                />
              )}
              {currentPoint && (
                <ReferenceDot
                  x={pct1(currentPoint.confidence_only.false_auto_execution_rate)}
                  y={pct1(currentPoint.confidence_only.automation_rate)}
                  r={8}
                  fill="none"
                  stroke={BASE_COLOR}
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">By disruption category</p>
            <p className="text-xs text-muted-foreground">
              {scopeLabel}
              {catRows[0] ? ` · n=${catRows[0].n} per category` : ""} · default thresholds
            </p>
          </div>
          <select
            value={catMetric}
            onChange={(e) => setCatMetric(e.target.value as CatMetric)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            aria-label="Category metric"
          >
            {CAT_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {catRows.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={catRows} margin={{ left: 0, right: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval={0} stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis unit="%" domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={tt}
                cursor={{ fill: "var(--surface-2)" }}
                formatter={(v: number) => `${v}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="gate" name="Decision Gate" fill={GATE_COLOR} radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="baseline"
                name="Confidence-only baseline"
                fill={BASE_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground">
            This summary.json has no per-category breakdown. Re-run{" "}
            <code className="font-mono">python -m vigilai.evaluate</code>.
          </p>
        )}
      </div>

      <RetrievalSection />
      <AiEvalSection />
    </div>
  );
}

/**
 * Stage 8: results/ai_eval.json via GET /evaluation/ai (live mode only). The reference labels
 * come from two AI models used as judges (LLM-as-judge), not from humans.
 */
function AiEvalSection() {
  const [data, setData] = useState<ApiAiEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .aiEvaluation()
      .then((raw) => {
        if (cancelled) return;
        if (isAiEvaluation(raw)) setData(raw);
        else setError("GET /evaluation/ai returned an unexpected shape.");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "results/ai_eval.json not found. Run `python -m vigilai.ai_eval` in backend/."
            : e instanceof Error
              ? e.message
              : String(e),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = data ? aiEvalRows(data.results) : [];
  const amb = data?.ambiguous;

  return (
    <div className="panel mt-4 p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">Independent evaluation</p>
        <p className="text-xs text-muted-foreground">
          {data
            ? `${data.counts.scenarios} hand-written synthetic scenarios · labels from two AI models (LLM-as-judge), not humans · system: ${data.system.reasoning_backend} backend, ${data.system.retriever} on corpus ${data.system.corpus}`
            : "Hand-written synthetic scenarios labelled by two AI models (LLM-as-judge), not humans"}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading independent evaluation…</p>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
            <span className="font-medium">AI labels, not human labels.</span> {data.labels_source}.
            Labellers: {Object.values(data.labellers).join("; ")}.
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="overflow-x-auto lg:col-span-2">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Labeller agreement (all {data.counts.scenarios})
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="p-3">Answer</th>
                    <th className="pr-3">Raw agreement</th>
                    <th className="pr-3">Cohen's κ</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["correct_action", "Correct action"],
                      ["needs_human_review", "Needs human review"],
                    ] as const
                  ).map(([k, label]) => {
                    const a = data.agreement.overall[k];
                    return (
                      <tr key={k} className="border-b border-border/60">
                        <td className="p-3">{label}</td>
                        <td className="pr-3 font-mono">
                          {a.raw_agreement === null ? "—" : `${fmt(a.raw_agreement)}%`}
                        </td>
                        <td className="pr-3 font-mono">{fmtKappa(a.kappa)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-1 py-3 text-xs text-muted-foreground">
                Agreed on both answers: {data.counts.agreed} scenarios (scored below). Ambiguous
                (they disagree): {data.counts.ambiguous}.
                {data.definitions?.kappa_note ? ` ${data.definitions.kappa_note}` : ""}
              </p>

              <p className="mb-1 mt-2 text-xs font-medium uppercase text-muted-foreground">
                Ambiguous set routing
              </p>
              {amb && amb.n > 0 ? (
                <p className="text-sm">
                  Decision Gate escalated{" "}
                  <span className="font-mono">
                    {amb.gate_escalated} / {amb.n}
                  </span>{" "}
                  · confidence-only escalated{" "}
                  <span className="font-mono">
                    {amb.confidence_only_escalated} / {amb.n}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No ambiguous scenarios.</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{amb?.note}</p>
            </div>

            <div className="lg:col-span-3">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Agreed set (n={data.counts.agreed}): Decision Gate vs confidence-only
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rows} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="metric"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    interval={0}
                  />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={tt}
                    cursor={{ fill: "var(--surface-2)" }}
                    formatter={(v: number, name: string) => [`${v}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="gate"
                    name="Decision Gate"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="baseline"
                    name="Confidence-only"
                    fill="var(--warn)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                By hard-case type (agreed set)
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="p-2">Type</th>
                    <th className="pr-2">n</th>
                    <th className="pr-2">Action acc.</th>
                    <th className="pr-2">Gate dec. acc.</th>
                    <th className="pr-2">Conf-only dec. acc.</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.by_case_type).map(([t, v]) => (
                    <tr key={t} className="border-b border-border/60">
                      <td className="p-2">{caseTypeLabel(t)}</td>
                      <td className="pr-2 font-mono">
                        {v.n}
                        {v.n_ambiguous ? (
                          <span className="text-muted-foreground"> (+{v.n_ambiguous} amb.)</span>
                        ) : null}
                      </td>
                      <td className="pr-2 font-mono">
                        {v.gate ? `${fmt(v.gate.action_accuracy)}%` : "—"}
                      </td>
                      <td className="pr-2 font-mono">
                        {v.gate ? `${fmt(v.gate.decision_accuracy)}%` : "—"}
                      </td>
                      <td className="pr-2 font-mono">
                        {v.confidence_only ? `${fmt(v.confidence_only.decision_accuracy)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                By category
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="p-2">Category</th>
                    <th className="pr-2">κ action</th>
                    <th className="pr-2">κ review</th>
                    <th className="pr-2">n agreed</th>
                    <th className="pr-2">Gate dec. acc.</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(data.agreement.by_category) as ApiCategory[]).map((c) => {
                    const ag = data.agreement.by_category[c];
                    const r = data.by_category[c];
                    return (
                      <tr key={c} className="border-b border-border/60">
                        <td className="p-2">
                          {CATEGORY_META[toCategory(c)].label}
                          {data.system_actions_by_category?.[c] && (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              system:{" "}
                              {Object.entries(data.system_actions_by_category[c] ?? {})
                                .map(([a, n]) => `${a} ×${n}`)
                                .join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="pr-2 font-mono">{fmtKappa(ag?.correct_action.kappa)}</td>
                        <td className="pr-2 font-mono">{fmtKappa(ag?.needs_human_review.kappa)}</td>
                        <td className="pr-2 font-mono">{r?.n ?? 0}</td>
                        <td className="pr-2 font-mono">
                          {r?.gate ? `${fmt(r.gate.decision_accuracy)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Limitations</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {data.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const RETRIEVER_STYLE = {
  tfidf: { label: "TF-IDF", color: "var(--primary)" },
  chroma: { label: "ChromaDB vectors", color: "var(--warn)" },
  hybrid: { label: "Hybrid (average)", color: "var(--ok)" },
} as const;

type RetrievalMode = "with_category_filter" | "without_filter";

/** Stage 5: results/retrieval_comparison.json via GET /evaluation/retrieval (live mode only). */
function RetrievalSection() {
  const { health } = useVigil();
  const [data, setData] = useState<ApiRetrievalComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rmode, setRmode] = useState<RetrievalMode>("with_category_filter");

  useEffect(() => {
    let cancelled = false;
    api
      .retrievalEvaluation()
      .then((raw) => {
        if (cancelled) return;
        if (isRetrievalComparison(raw)) setData(raw);
        else setError("GET /evaluation/retrieval returned an unexpected shape.");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? "results/retrieval_comparison.json not found. Run `python -m vigilai.evaluate --retrieval` in backend/."
            : e instanceof Error
              ? e.message
              : String(e),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = retrievalLabel(health);
  const block = data?.[rmode];
  const rows = block ? retrievalRows(block) : [];

  return (
    <div className="panel mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Retrieval</p>
          <p className="text-xs text-muted-foreground">
            {data
              ? `TF-IDF vs ChromaDB vs hybrid on corpus ${data.setup.corpus} · ${data.setup.documents} docs · ${data.setup.queries} hand-labelled queries`
              : "TF-IDF vs ChromaDB vs hybrid"}
            {active ? ` · active in the API: ${active}` : ""}
          </p>
        </div>
        {data && (
          <select
            value={rmode}
            onChange={(e) => setRmode(e.target.value as RetrievalMode)}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            aria-label="Retrieval setting"
          >
            <option value="with_category_filter">With category filter (as the pipeline)</option>
            <option value="without_filter">Whole corpus, no filter</option>
          </select>
        )}
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : !data || !block ? (
        <p className="text-sm text-muted-foreground">Loading retrieval results…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="overflow-x-auto lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-3">Retriever</th>
                  <th className="pr-3">hit@1</th>
                  <th className="pr-3">hit@3</th>
                  <th className="pr-3">MRR</th>
                </tr>
              </thead>
              <tbody>
                {RETRIEVERS.map((k) => (
                  <tr key={k} className="border-b border-border/60">
                    <td className="p-3">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: RETRIEVER_STYLE[k].color }}
                      />
                      {RETRIEVER_STYLE[k].label}
                    </td>
                    <td className="pr-3 font-mono">{fmt(block[k]["hit@1"])}%</td>
                    <td className="pr-3 font-mono">{fmt(block[k]["hit@3"])}%</td>
                    <td className="pr-3 font-mono">{block[k].mrr.toFixed(3)}</td>
                  </tr>
                ))}
                <tr className="border-b border-border/60 text-muted-foreground">
                  <td className="p-3">Random ranking (expected)</td>
                  <td className="pr-3 font-mono">{fmt(block.random_baseline["hit@1"])}%</td>
                  <td className="pr-3 font-mono">{fmt(block.random_baseline["hit@3"])}%</td>
                  <td className="pr-3 font-mono">{block.random_baseline.mrr.toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
            <p className="px-1 py-3 text-xs text-muted-foreground">
              hit@k: share of queries with a relevant document in the top k. MRR: mean of 1 / rank
              of the first relevant document. Hybrid = {data.setup.hybrid}. Embeddings:{" "}
              {data.setup.embedding_model}.
            </p>
          </div>
          <div className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="metric" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={tt}
                  cursor={{ fill: "var(--surface-2)" }}
                  formatter={(v: number, name: string, item: { payload?: { metric?: string } }) => [
                    item.payload?.metric?.startsWith("MRR") ? (v / 100).toFixed(3) : `${v}%`,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {RETRIEVERS.map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={RETRIEVER_STYLE[k].label}
                    fill={RETRIEVER_STYLE[k].color}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data && (
        <p className="mt-2 text-xs text-muted-foreground">Caveat from the backend: "{data.note}"</p>
      )}
    </div>
  );
}
