import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/bits";
import { AgentDetail, kindIcon } from "@/components/TracePanel";
import { PIPELINE } from "@/data/vigilai";
import { useVigil } from "@/state/vigil";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Agent Pipeline & Reasoning Trace — VigilAI" },
      {
        name: "description",
        content:
          "Interactive multi-agent pipeline: signal agents, RAG-grounded synthesis, strategy, decision gate and communications.",
      },
      { property: "og:title", content: "Agent Pipeline & Reasoning Trace — VigilAI" },
      {
        property: "og:description",
        content: "Click any agent to inspect its MCP tool call, retrieved context and structured output.",
      },
    ],
  }),
  component: Pipeline,
});

const SIGNAL_IDS = ["weather", "geonews", "telemetry", "supplier"];

const EXAMPLE = {
  id: "ALT-1042",
  action: "reroute" as const,
  cost: 14200,
  confidence: 91,
  summary: "Port strike risk affecting 3 shipments via Chennai route — recommended action: Reroute.",
};

function Pipeline() {
  const { thresholds } = useVigil();
  const [selected, setSelected] = useState("synthesizer");
  const [pulse, setPulse] = useState<number | null>(null);

  const order = [...SIGNAL_IDS, "synthesizer", "strategist", "gate", "comms"];

  useEffect(() => {
    if (pulse === null) return;
    if (pulse >= order.length) {
      const done = setTimeout(() => setPulse(null), 900);
      return () => clearTimeout(done);
    }
    const id = setTimeout(() => setPulse((p) => (p === null ? null : p + 1)), 750);
    return () => clearTimeout(id);
  }, [pulse, order.length]);

  const activeStage = pulse === null ? null : order[Math.min(pulse, order.length - 1)];
  const agent = PIPELINE.find((p) => p.id === selected)!;

  return (
    <div>
      <PageHeading
        title="Agent Pipeline & Reasoning Trace"
        subtitle="Four signal agents call MCP tools, two LLM agents reason over retrieved context, then a deterministic gate decides auto vs human."
        actions={
          <button
            onClick={() => setPulse(0)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Play className="h-4 w-4" />
            {pulse === null ? "Play ALT-1042 through pipeline" : "Running…"}
          </button>
        }
      />

      <div className="panel grid-backdrop overflow-x-auto p-5">
        <div className="flex min-w-[980px] items-center gap-4">
          <div className="grid gap-2">
            {SIGNAL_IDS.map((id) => (
              <PipelineBox
                key={id}
                id={id}
                selected={selected === id}
                active={activeStage === id}
                onClick={() => setSelected(id)}
              />
            ))}
          </div>
          <Arrow />
          <PipelineBox
            id="synthesizer"
            selected={selected === "synthesizer"}
            active={activeStage === "synthesizer"}
            onClick={() => setSelected("synthesizer")}
          />
          <Arrow />
          <PipelineBox
            id="strategist"
            selected={selected === "strategist"}
            active={activeStage === "strategist"}
            onClick={() => setSelected("strategist")}
          />
          <Arrow />
          <PipelineBox
            id="gate"
            selected={selected === "gate"}
            active={activeStage === "gate"}
            onClick={() => setSelected("gate")}
          />
          <Arrow />
          <PipelineBox
            id="comms"
            selected={selected === "comms"}
            active={activeStage === "comms"}
            onClick={() => setSelected("comms")}
          />
        </div>
      </div>

      <div className="mt-4">
        <AgentDetail agent={agent} thresholds={thresholds} example={EXAMPLE} />
      </div>
    </div>
  );
}

function Arrow() {
  return <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function PipelineBox({
  id,
  selected,
  active,
  onClick,
}: {
  id: string;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const node = PIPELINE.find((p) => p.id === id)!;
  const Icon = kindIcon(node.kind);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-[178px] rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all",
        selected && "border-primary/60",
        active && "glow-ring scale-[1.03]",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", active || selected ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate text-sm font-medium">{node.name}</span>
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {node.kind === "llm" ? "LLM + RAG" : node.kind === "gate" ? "policy gate" : node.kind}
      </p>
    </button>
  );
}
