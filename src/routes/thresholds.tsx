import { createFileRoute } from "@tanstack/react-router";
import { CategoryBadge, PageHeading, ReversibleTag, money } from "@/components/bits";
import { ACTION_META, DEFAULT_THRESHOLDS } from "@/data/vigilai";
import { gateVerdict, useVigil } from "@/state/vigil";

export const Route = createFileRoute("/thresholds")({
  head: () => ({
    meta: [
      { title: "Threshold Control — VigilAI" },
      { name: "description", content: "Tune the cost and confidence limits that decide when agents act alone and when a human must approve." },
      { property: "og:title", content: "Threshold Control — VigilAI" },
      { property: "og:description", content: "Live Decision Gate tuning with instant auto vs. escalate preview." },
    ],
  }),
  component: Thresholds,
});

function Thresholds() {
  const { alerts, thresholds, setThresholds } = useVigil();
  const rows = alerts.map((a) => {
    const opt = a.options.find((o) => o.id === a.recommendedOptionId) ?? a.options[0]!;
    return { a, opt, v: gateVerdict(opt.cost, a.confidence, opt.action, thresholds) };
  });
  const autoCount = rows.filter((r) => r.v.auto).length;

  return (
    <div>
      <PageHeading
        title="Threshold Control Panel"
        subtitle="The Decision Gate auto-executes only when cost ≤ limit, confidence ≥ floor, and the action is reversible."
        actions={
          <button
            onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Reset defaults
          </button>
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
              type="range" min={0} max={50000} step={500} value={thresholds.cost}
              onChange={(e) => setThresholds({ cost: +e.target.value })}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">Min confidence</span>
              <span className="font-mono text-primary">{thresholds.confidence}%</span>
            </div>
            <input
              type="range" min={50} max={99} value={thresholds.confidence}
              onChange={(e) => setThresholds({ confidence: +e.target.value })}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-medium">Always escalated (irreversible)</p>
            <p className="mt-1 text-muted-foreground">
              {Object.entries(ACTION_META).filter(([, m]) => !m.reversible).map(([, m]) => m.label).join(", ")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border border-border p-3">
              <p className="text-2xl font-semibold text-ok">{autoCount}</p>
              <p className="text-xs text-muted-foreground">would auto-execute</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-2xl font-semibold text-warn">{rows.length - autoCount}</p>
              <p className="text-xs text-muted-foreground">would escalate</p>
            </div>
          </div>
        </div>
        <div className="panel overflow-x-auto p-0 lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Alert</th><th>Action</th><th>Cost</th><th>Conf.</th><th className="pr-3">Gate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, opt, v }) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="p-3"><p className="font-mono text-xs">{a.id}</p><CategoryBadge category={a.category} /></td>
                  <td><div className="flex flex-col gap-1"><span>{v.label}</span><ReversibleTag action={opt.action} /></div></td>
                  <td className={v.costOk ? "" : "text-destructive"}>{money(opt.cost)}</td>
                  <td className={v.confOk ? "" : "text-destructive"}>{a.confidence}%</td>
                  <td className="pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.auto ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>
                      {v.auto ? "Auto" : "Escalate"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
