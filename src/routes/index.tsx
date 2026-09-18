import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCard } from "@/components/AlertCard";
import { KpiCard, PageHeading } from "@/components/bits";
import { ACTION_META, CATEGORY_META, type ActionType, type Category } from "@/data/vigilai";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center — VigilAI" },
      {
        name: "description",
        content:
          "Live KPIs, alert feed and decision mix for the VigilAI agentic supply chain disruption response center.",
      },
      { property: "og:title", content: "Command Center — VigilAI" },
      {
        property: "og:description",
        content: "Live KPIs, alert feed and decision mix across the VigilAI agent pipeline.",
      },
    ],
  }),
  component: Overview,
});

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
};

function Overview() {
  const { alerts, decisions, kpis } = useVigil();

  const byCategory = (Object.keys(CATEGORY_META) as Category[])
    .map((c) => ({
      name: CATEGORY_META[c].label,
      value: alerts.filter((a) => a.category === c).length + decisions.filter((d) => d.category === c).length,
      color: CATEGORY_META[c].color,
    }))
    .filter((d) => d.value > 0);

  const byAction = (Object.keys(ACTION_META) as ActionType[]).map((a) => ({
    name: ACTION_META[a].label,
    value: decisions.filter((d) => d.action === a).length,
  }));

  const recent = [...alerts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div>
      <PageHeading
        title="Command Center"
        subtitle="Real-time posture across 8 disruption categories, 7 agents and the human decision gate."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Active Alerts" value={String(kpis.activeAlerts)} trend={12} hint="awaiting triage" />
        <KpiCard label="Decisions Today" value={String(kpis.decisionsToday)} trend={8} hint="across all lanes" />
        <KpiCard label="% Auto-Executed" value={`${kpis.autoPct}%`} trend={5} hint="within thresholds" />
        <KpiCard
          label="% Escalated to Human"
          value={`${kpis.escalatedPct}%`}
          trend={-5}
          hint="gate-forced review"
        />
        <KpiCard
          label="Est. Human Hours Saved"
          value={`${kpis.hoursSaved}h`}
          trend={17}
          hint="this week"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Live Feed
            </h2>
          </div>
          <div className="space-y-3">
            {recent.map((a) => (
              <AlertCard key={a.id} alert={a} compact />
            ))}
          </div>
        </section>

        <section className="space-y-4 lg:col-span-2">
          <div className="panel p-4">
            <h2 className="text-sm font-semibold">Alerts by Disruption Category</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {byCategory.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {byCategory.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="text-sm font-semibold">Decisions by Action Type</h2>
            <div className="mt-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byAction} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
