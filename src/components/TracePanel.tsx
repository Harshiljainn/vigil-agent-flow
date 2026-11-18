import { Bot, Cpu, ShieldCheck, Terminal } from "lucide-react";
import { ReasoningBadge, money } from "@/components/bits";
import type { NodeKind, PipelineNode } from "@/data/system";
import type { ApiAgentReasoning, ApiAlertView, ApiProvenance, ApiSignal } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Real trace of one alert through the pipeline, from GET /alerts/{id}. No canned text. */

export function kindIcon(kind: NodeKind) {
  if (kind === "agent") return Bot;
  if (kind === "gate") return ShieldCheck;
  if (kind === "comms") return Terminal;
  return Cpu;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SignalList({ signals }: { signals: ApiSignal[] }) {
  if (!signals.length) {
    return <p className="text-sm text-muted-foreground">No signals from this source.</p>;
  }
  return (
    <ul className="space-y-2">
      {signals.map((s, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-primary">{s.source}</span>
            <span className="text-muted-foreground">reliability {s.reliability}</span>
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wide",
                s.supports ? "bg-ok/15 text-ok" : "bg-destructive/15 text-destructive",
              )}
            >
              {s.supports ? "supports" : "contradicts"}
            </span>
          </div>
          <p className="mt-1">{s.summary}</p>
        </li>
      ))}
    </ul>
  );
}

const source = (p: ApiProvenance) => ({
  backend: p.backend,
  model: p.model,
  fallback: p.fallback,
  fallbackReason: p.fallback_reason,
});

/** Agent-written text (Gemini or rule template), with which backend produced it. */
function AgentText({
  title,
  provenance,
  children,
}: {
  title: string;
  provenance: ApiProvenance;
  children: React.ReactNode;
}) {
  return (
    <Section title={title}>
      <div className="rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ReasoningBadge source={source(provenance)} />
          {provenance.fallback && provenance.fallback_reason && (
            <span className="text-muted-foreground">fallback: {provenance.fallback_reason}</span>
          )}
          {!provenance.fallback && provenance.fallback_reason && (
            <span className="text-muted-foreground">{provenance.fallback_reason}</span>
          )}
        </div>
        <div className="mt-2 space-y-1.5">{children}</div>
      </div>
    </Section>
  );
}

function Votes({ r }: { r: ApiAgentReasoning }) {
  if (!r.k) return null;
  const entries = Object.entries(r.votes).sort((a, b) => b[1] - a[1]);
  return (
    <p className="font-mono text-xs text-muted-foreground">
      votes over k={r.k} samples ({r.samples} valid):{" "}
      {entries.map(([a, n]) => `${a} ${n}/${r.k}`).join(", ") || "none"}
      {r.agreement !== null && ` · agreement ${pct(r.agreement)}`}
    </p>
  );
}

export function NodeDetail({ node, view }: { node: PipelineNode; view: ApiAlertView }) {
  const Icon = kindIcon(node.kind);
  const a = view.alert;
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">{node.name}</h3>
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {node.built ? node.kind : "planned"}
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{a.id}</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{node.role}</p>
      {node.built && <p className="mt-1 font-mono text-[11px] text-primary">{node.code}</p>}

      {node.kind === "signal" && (
        <Section title={`Signals returned by ${node.name}`}>
          <SignalList signals={a.signals.filter((s) => s.source === node.id)} />
        </Section>
      )}

      {node.id === "synthesizer" && (
        <>
          <Section title="Output alert">
            <div className="grid gap-2 font-mono text-xs sm:grid-cols-4">
              <div className="rounded-md bg-surface-2 p-2">category = {a.category}</div>
              <div className="rounded-md bg-surface-2 p-2">severity = {a.severity}</div>
              <div className="rounded-md bg-surface-2 p-2">confidence = {a.confidence}</div>
              <div className="rounded-md bg-surface-2 p-2">grounded = {String(a.grounded)}</div>
            </div>
          </Section>
          {view.reasoning && (
            <AgentText title="Synthesizer reasoning" provenance={view.reasoning.synthesizer}>
              <p className="font-medium">{view.reasoning.summary}</p>
              <p className="text-muted-foreground">{view.reasoning.reasoning}</p>
              <p className="font-mono text-xs text-muted-foreground">
                cited: {view.reasoning.cited_doc_ids.join(", ") || "none"} · confidence is computed
                by code, not by the LLM
              </p>
            </AgentText>
          )}
          <Section title={`Input signals (${a.signals.length})`}>
            <SignalList signals={a.signals} />
          </Section>
          <Section title={`Retrieved evidence (${a.evidence.length}, TF-IDF score)`}>
            {a.evidence.length ? (
              <ul className="space-y-2">
                {a.evidence.map((e) => (
                  <li
                    key={e.doc_id}
                    className="rounded-lg border border-border bg-surface p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-primary">{e.doc_id}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5">{e.kind}</span>
                      <span className="ml-auto font-mono">score {e.score}</span>
                    </div>
                    <p className="mt-1 font-medium">{e.title}</p>
                    <p className="mt-0.5 text-muted-foreground">{e.snippet}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No documents retrieved.</p>
            )}
          </Section>
        </>
      )}

      {node.id === "strategist" && view.reasoning && (
        <AgentText title="Strategist rationale" provenance={view.reasoning.strategist}>
          <p>{view.reasoning.strategist_rationale}</p>
          <Votes r={view.reasoning} />
        </AgentText>
      )}

      {node.id === "strategist" && (
        <Section title={`Proposed options (${view.options.length}, ranked)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2">#</th>
                  <th>Action</th>
                  <th>Cost</th>
                  <th>Delay</th>
                  <th>Conf.</th>
                  <th>Reversible</th>
                  <th className="pr-2">Source docs</th>
                </tr>
              </thead>
              <tbody>
                {view.options.map((o, i) => {
                  const rec = o.action === view.chosen.action;
                  return (
                    <tr
                      key={o.action}
                      className={cn("border-b border-border/60", rec && "bg-primary/5")}
                    >
                      <td className="py-2 pr-2 font-mono text-xs">{i + 1}</td>
                      <td>
                        <span className="font-mono text-xs">{o.action}</span>
                        {rec && (
                          <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase text-primary">
                            recommended
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">{o.description}</p>
                      </td>
                      <td className="font-mono">{money(o.cost_usd)}</td>
                      <td className="font-mono">{o.delay_hours}h</td>
                      <td className="font-mono">
                        {o.confidence}
                        {o.agreement != null && (
                          <div className="text-[10px] text-muted-foreground">
                            agree {pct(o.agreement)}
                          </div>
                        )}
                      </td>
                      <td className={o.reversible ? "text-ok" : "text-destructive"}>
                        {o.reversible ? "yes" : "no"}
                      </td>
                      <td className="pr-2 font-mono text-[11px]">
                        {o.source_docs.length ? o.source_docs.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {node.id === "gate" && <GateTrace view={view} />}

      {node.kind === "comms" && (
        <Section title="Status">
          <p className="text-sm text-muted-foreground">
            Not built. For this alert the backend recorded status{" "}
            <span className="font-mono text-foreground">{view.status}</span> in the audit log (seq{" "}
            {view.audit_seq}); no message was sent.
          </p>
        </Section>
      )}
    </div>
  );
}

function GateTrace({ view }: { view: ApiAlertView }) {
  const c = view.chosen;
  const t = view.decision.thresholds;
  const auto = view.decision.route === "auto_execute";
  const checks = [
    {
      label: "Cost",
      detail: `${money(c.cost_usd)} ≤ ${money(t.cost_limit_usd)}`,
      pass: c.cost_usd <= t.cost_limit_usd,
    },
    {
      label: "Confidence",
      detail: `${c.confidence} ≥ ${t.confidence_min}`,
      pass: c.confidence >= t.confidence_min,
    },
    {
      label: "Reversible",
      detail: c.reversible ? `${c.action} is reversible` : `${c.action} is irreversible`,
      pass: c.reversible || !t.require_reversible,
    },
  ];
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Thresholds used (snapshot at decision time)
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs">
          <div className="rounded-md bg-surface-2 p-2">cost_limit_usd = {t.cost_limit_usd}</div>
          <div className="rounded-md bg-surface-2 p-2">confidence_min = {t.confidence_min}</div>
          <div className="rounded-md bg-surface-2 p-2">
            require_reversible = {String(t.require_reversible)}
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Checks on the recommended option ({c.action})
        </p>
        <ul className="mt-2 space-y-1.5">
          {checks.map((s) => (
            <li key={s.label} className="flex items-start gap-2 text-xs">
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.pass ? "var(--ok)" : "var(--destructive)" }}
              />
              <span>
                <span className="font-medium">{s.label}</span>{" "}
                <span className="text-muted-foreground">— {s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Gate reasons (from backend)
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
          {view.decision.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p
          className="mt-3 rounded-md px-3 py-2 text-xs font-semibold"
          style={{
            color: auto ? "var(--ok)" : "var(--warn)",
            backgroundColor: `color-mix(in oklab, ${auto ? "var(--ok)" : "var(--warn)"} 14%, transparent)`,
          }}
        >
          Route: {auto ? "AUTO-EXECUTE (simulated)" : "HUMAN REVIEW"} · status {view.status}
        </p>
      </div>
    </div>
  );
}
