import { Bot, Cpu, Database, ShieldCheck, Terminal } from "lucide-react";
import {
  ACTION_META,
  IRREVERSIBLE_ACTIONS,
  PIPELINE,
  type ActionType,
  type AgentNode,
} from "@/data/vigilai";
import { money } from "@/components/bits";
import { gateVerdict } from "@/state/vigil";

export function kindIcon(kind: AgentNode["kind"]) {
  if (kind === "llm") return Bot;
  if (kind === "gate") return ShieldCheck;
  if (kind === "comms") return Terminal;
  return Cpu;
}

export function AgentDetail({
  agent,
  thresholds,
  example,
}: {
  agent: AgentNode;
  thresholds: { cost: number; confidence: number };
  example: { id: string; action: ActionType; cost: number; confidence: number; summary: string };
}) {
  const Icon = kindIcon(agent.kind);
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">{agent.name}</h3>
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {agent.kind === "llm" ? "LLM agent" : agent.kind === "gate" ? "policy gate" : agent.kind}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{agent.role}</p>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          MCP tool call
        </p>
        <code className="mt-1 block overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs text-primary">
          {agent.mcp}
        </code>
      </div>

      {agent.trace && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Reasoning trace
            </p>
            {agent.trace.retrieved.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-primary">
                Retrieved from: {agent.trace.retrieved.join(", ")}
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {agent.trace.thought}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Structured output
            </p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/85">
              {agent.trace.output}
            </pre>
          </div>
        </div>
      )}

      {agent.kind === "gate" && (
        <GateDetail thresholds={thresholds} example={example} />
      )}
    </div>
  );
}

export function GateDetail({
  thresholds,
  example,
}: {
  thresholds: { cost: number; confidence: number };
  example: { id: string; action: ActionType; cost: number; confidence: number; summary: string };
}) {
  const v = gateVerdict(example.cost, example.confidence, example.action, thresholds);
  const steps = [
    {
      label: "1 · Cost check",
      detail: `${money(example.cost)} vs threshold ${money(thresholds.cost)}`,
      pass: v.costOk,
    },
    {
      label: "2 · Confidence check",
      detail: `${example.confidence}% vs threshold ${thresholds.confidence}%`,
      pass: v.confOk,
    },
    {
      label: "3 · Reversibility override",
      detail: v.irreversible
        ? `${v.label} is irreversible → force escalation`
        : `${v.label} is reversible → no override`,
      pass: !v.irreversible,
    },
  ];

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current thresholds
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="rounded-md bg-surface-2 p-2">
            cost_max = {money(thresholds.cost)}
          </div>
          <div className="rounded-md bg-surface-2 p-2">
            confidence_min = {thresholds.confidence}%
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reversibility lookup table
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px]">
          {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
            <li
              key={a}
              className={
                IRREVERSIBLE_ACTIONS.includes(a)
                  ? "rounded bg-destructive/12 px-1.5 py-1 text-destructive"
                  : "rounded bg-ok/12 px-1.5 py-1 text-ok"
              }
            >
              {a}: {IRREVERSIBLE_ACTIONS.includes(a) ? "false" : "true"}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Worked example · {example.id}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{example.summary}</p>
        <ul className="mt-3 space-y-2">
          {steps.map((s) => (
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
        <p
          className="mt-3 rounded-md px-3 py-2 text-xs font-semibold"
          style={{
            color: v.auto ? "var(--ok)" : "var(--warn)",
            backgroundColor: `color-mix(in oklab, ${v.auto ? "var(--ok)" : "var(--warn)"} 14%, transparent)`,
          }}
        >
          Final verdict: {v.auto ? "AUTO-EXECUTE" : "ESCALATE TO HUMAN"}
        </p>
      </div>
    </div>
  );
}

export function DecisionTrace({
  decisionId,
  action,
  cost,
  confidence,
  summary,
  thresholds,
}: {
  decisionId: string;
  action: ActionType;
  cost: number;
  confidence: number;
  summary: string;
  thresholds: { cost: number; confidence: number };
}) {
  const synth = PIPELINE.find((p) => p.id === "synthesizer")!;
  const strat = PIPELINE.find((p) => p.id === "strategist")!;
  return (
    <div className="space-y-3">
      {[synth, strat].map((a) => (
        <div key={a.id} className="rounded-lg border border-border bg-surface p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Bot className="h-3.5 w-3.5 text-primary" />
            {a.name}
          </p>
          <p className="mt-1 font-mono text-[11px] text-primary">
            Retrieved from: {a.trace!.retrieved.join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{a.trace!.thought}</p>
        </div>
      ))}
      <GateDetail
        thresholds={thresholds}
        example={{ id: decisionId, action, cost, confidence, summary }}
      />
    </div>
  );
}
