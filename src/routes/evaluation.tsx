import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard, PageHeading } from "@/components/bits";
import { CATEGORY_META, type Category } from "@/data/vigilai";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation & Analytics — VigilAI" },
      { name: "description", content: "Decision accuracy, automation rate, and per-category agent performance for VigilAI." },
      { property: "og:title", content: "Evaluation & Analytics — VigilAI" },
      { property: "og:description", content: "How accurate and efficient are the agents? Measured outcomes by category and week." },
    ],
  }),
  component: Evaluation,
});

const tt = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" };

function Evaluation() {
  const { decisions, kpis } = useVigil();
  const judged = decisions.filter((d) => d.outcome !== "pending");
  const acc = (ds: typeof judged) => (ds.length ? Math.round((ds.filter((d) => d.outcome === "correct").length / ds.length) * 100) : 0);
  const autoAcc = acc(judged.filter((d) => d.mode === "auto"));
  const humanAcc = acc(judged.filter((d) => d.mode === "human"));

  const byCat = (Object.keys(CATEGORY_META) as Category[]).map((c) => ({
    name: CATEGORY_META[c].label, accuracy: acc(judged.filter((d) => d.category === c)), color: CATEGORY_META[c].color,
  }));
  const weeks = ["W32", "W33", "W34", "W35", "W36", "W37", "W38"].map((w, i) => ({
    week: w, accuracy: 78 + i * 2 + (i % 2), automation: 38 + i * 4, mttr: 9.5 - i * 1.1,
  }));

  return (
    <div>
      <PageHeading title="Evaluation & Analytics" subtitle="Measured outcomes of agent recommendations against ground truth." />
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Overall accuracy" value={`${acc(judged)}%`} trend={4} hint={`${judged.length} judged decisions`} />
        <KpiCard label="Auto-decision accuracy" value={`${autoAcc}%`} hint="Low-risk, gate-approved" />
        <KpiCard label="Human-reviewed accuracy" value={`${humanAcc}%`} hint="Escalated decisions" />
        <KpiCard label="Analyst hours saved" value={`${kpis.hoursSaved}h`} trend={12} hint="vs. manual triage" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="mb-3 text-sm font-medium">Accuracy by disruption category</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCat} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={90} />
              <Tooltip contentStyle={tt} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel p-4">
          <p className="mb-3 text-sm font-medium">Weekly trend — accuracy & automation rate (%)</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={weeks}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tt} />
              <Line dataKey="accuracy" stroke="var(--ok)" strokeWidth={2} />
              <Line dataKey="automation" stroke="var(--primary)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-medium">Mean time to resolution (hours)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeks}>
              <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tt} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="mttr" fill="var(--warn)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
