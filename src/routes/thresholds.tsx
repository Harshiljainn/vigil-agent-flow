import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryBadge, PageHeading, ReversibleTag, money } from "@/components/bits";
import { ACTION_META } from "@/data/vigilai";
import { api, type ApiPreview } from "@/lib/api";
import { gateVerdict, useVigil } from "@/state/vigil";

export const Route = createFileRoute("/thresholds")({
  head: () => ({
    meta: [
      { title: "Threshold Control — VigilAI" },
      {
        name: "description",
        content:
          "Tune the cost and confidence limits that decide when agents act alone and when a human must approve.",
      },
      { property: "og:title", content: "Threshold Control — VigilAI" },
      {
        property: "og:description",
        content:
          "Decision Gate tuning with a backend preview of which decisions would change route.",
      },
    ],
  }),
  component: Thresholds,
});

const PREVIEW_DEBOUNCE_MS = 300;

const tt = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
};

function Thresholds() {
  const {
    mode,
    alerts,
    thresholds,
    setThresholds,
    resetThresholds,
    serverThresholds,
    applyThresholds,
  } = useVigil();
  const live = mode === "live";

  // ---------- backend preview (debounced) ----------
  const [preview, setPreview] = useState<ApiPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const reqId = useRef(0);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!live) {
      setPreview(null);
      return;
    }
    const id = ++reqId.current;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      api
        .previewThresholds({
          cost_limit_usd: thresholds.cost,
          confidence_min: thresholds.confidence / 100,
        })
        .then((p) => {
          if (id !== reqId.current) return; // a newer slider value is in flight
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e: unknown) => {
          if (id !== reqId.current) return;
          setPreviewError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (id === reqId.current) setPreviewing(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // serverThresholds: re-preview after Apply (the "current" routes are unchanged, but N may grow)
  }, [
    live,
    thresholds.cost,
    thresholds.confidence,
    serverThresholds?.cost,
    serverThresholds?.confidence,
    alerts.length,
  ]);

  const flips = new Map((preview?.changes ?? []).map((c) => [c.alert_id, c]));

  // ---------- table rows ----------
  const rows = alerts.flatMap((a) => {
    const opt = a.options.find((o) => o.id === a.recommendedOptionId) ?? a.options[0];
    if (!opt) return [];
    const conf = opt.confidence ?? a.confidence;
    const v = gateVerdict(opt.cost, conf, opt.action, thresholds, opt.reversible);
    // Live: compare the exact backend value, as the gate does (95% shown may be 0.9485).
    const confOk =
      opt.confidenceExact !== undefined
        ? opt.confidenceExact >= thresholds.confidence / 100
        : v.confOk;
    const confText =
      opt.confidenceExact !== undefined ? `${(opt.confidenceExact * 100).toFixed(1)}%` : `${conf}%`;
    // Live: the route comes from the backend (current route, or the preview's flip).
    // Demo: the local mirror of the gate decides.
    const flip = flips.get(a.id);
    const auto =
      live && a.route ? (flip ? flip.proposed_route : a.route) === "auto_execute" : v.auto;
    return [{ a, opt, confOk, confText, v, auto, flip }];
  });
  const autoCount = rows.filter((r) => r.auto).length;

  const dirty =
    live &&
    serverThresholds !== null &&
    (serverThresholds.cost !== thresholds.cost ||
      serverThresholds.confidence !== thresholds.confidence);

  const chart = preview
    ? [
        { name: "Auto → human", value: preview.auto_to_human, color: "var(--warn)" },
        { name: "Human → auto", value: preview.human_to_auto, color: "var(--ok)" },
        {
          name: "Unchanged",
          value: preview.total_decisions - preview.would_change,
          color: "var(--muted-foreground)",
        },
      ]
    : [];

  const onApply = async () => {
    setApplying(true);
    await applyThresholds();
    setApplying(false);
  };

  return (
    <div>
      <PageHeading
        title="Threshold Control Panel"
        subtitle="The Decision Gate auto-executes only when cost ≤ limit, confidence ≥ floor, and the action is reversible."
        actions={
          <div className="flex gap-2">
            <button
              onClick={resetThresholds}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              {live ? "Reset to applied" : "Reset defaults"}
            </button>
            <button
              onClick={() => void onApply()}
              disabled={!dirty || applying}
              title={live ? undefined : "No backend: nothing to apply to"}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? "Applying…" : "Apply"}
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-6 p-5 lg:col-span-1">
          <div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Max auto-approve cost</span>
              <span className="font-mono text-primary">{money(thresholds.cost)}</span>
            </div>
            <input
              type="range"
              min={500}
              max={50000}
              step={500}
              value={thresholds.cost}
              onChange={(e) => setThresholds({ cost: +e.target.value })}
              className="mt-3 w-full accent-[var(--primary)]"
              aria-label="Max auto-approve cost"
            />
            {serverThresholds && (
              <p className="mt-1 text-xs text-muted-foreground">
                Applied: {money(serverThresholds.cost)}
              </p>
            )}
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Min confidence</span>
              <span className="font-mono text-primary">{thresholds.confidence}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={99}
              value={thresholds.confidence}
              onChange={(e) => setThresholds({ confidence: +e.target.value })}
              className="mt-3 w-full accent-[var(--primary)]"
              aria-label="Min confidence"
            />
            {serverThresholds && (
              <p className="mt-1 text-xs text-muted-foreground">
                Applied: {serverThresholds.confidence}%
              </p>
            )}
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <Lock className="h-3.5 w-3.5" /> Reversible actions only — locked
            </p>
            <p className="mt-1 text-muted-foreground">
              Irreversible actions are always escalated to a human. This is a fixed rule of the
              Decision Gate and cannot be switched off here.
            </p>
            {!live && (
              <p className="mt-1 text-xs text-muted-foreground">
                Demo action types treated as irreversible:{" "}
                {Object.values(ACTION_META)
                  .filter((m) => !m.reversible)
                  .map((m) => m.label)
                  .join(", ")}
              </p>
            )}
          </div>
          <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Apply</span> changes the thresholds the
            backend uses for <span className="font-medium text-foreground">new decisions only</span>
            . Past decisions and audit records keep the thresholds they were made with.
          </p>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5">
            {live ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    {preview ? (
                      <>
                        <span className="text-2xl font-semibold text-primary">
                          {preview.would_change}
                        </span>{" "}
                        of {preview.total_decisions} decisions would change route
                      </>
                    ) : previewError ? (
                      <span className="text-destructive">Preview failed: {previewError}</span>
                    ) : (
                      "Loading preview…"
                    )}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {previewing ? "updating…" : "POST /thresholds/preview"}
                  </span>
                </div>
                {preview && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compared with the route each past decision actually took. Past decisions are not
                    re-routed; this shows what these thresholds would have done.
                  </p>
                )}
                {preview && (
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={chart} layout="vertical" margin={{ left: 20, right: 24 }}>
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        domain={[0, preview.total_decisions]}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <Tooltip contentStyle={tt} cursor={{ fill: "var(--surface-2)" }} />
                      <Bar
                        dataKey="value"
                        name="Decisions"
                        radius={[0, 6, 6, 0]}
                        isAnimationActive={false}
                      >
                        {chart.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No backend: the "would change route" preview needs the backend. The table below uses
                a local copy of the gate rules on demo data.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="panel p-3">
              <p className="text-2xl font-semibold text-ok">{autoCount}</p>
              <p className="text-xs text-muted-foreground">would auto-execute</p>
            </div>
            <div className="panel p-3">
              <p className="text-2xl font-semibold text-warn">{rows.length - autoCount}</p>
              <p className="text-xs text-muted-foreground">would escalate</p>
            </div>
          </div>

          <div className="panel overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-3">Alert</th>
                  <th>Action</th>
                  <th>Cost</th>
                  <th>Conf.</th>
                  <th className="pr-3">Gate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, opt, confOk, confText, v, auto, flip }) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="p-3">
                      <p className="font-mono text-xs">{a.id}</p>
                      <CategoryBadge category={a.category} />
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span>{opt.backendAction ?? v.label}</span>
                        <ReversibleTag action={opt.action} reversible={opt.reversible} />
                      </div>
                    </td>
                    <td className={v.costOk ? "" : "text-destructive"}>{money(opt.cost)}</td>
                    <td className={confOk ? "" : "text-destructive"}>{confText}</td>
                    <td className="pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${auto ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}
                      >
                        {auto ? "Auto" : "Escalate"}
                      </span>
                      {flip && (
                        <span
                          className="ml-1 text-xs font-medium text-primary"
                          title={flip.proposed_reasons.join("; ")}
                        >
                          changes
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
