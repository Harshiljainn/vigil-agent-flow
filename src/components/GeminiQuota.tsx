import { Sparkles } from "lucide-react";
import { geminiQuota } from "@/lib/webrun";
import { useVigil } from "@/state/vigil";

/** Read-only quota line: "Gemini: N calls left today", or why new alerts use the rule fallback. */
export function GeminiQuota() {
  const { llm } = useVigil();
  const q = geminiQuota(llm);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      title={q.label}
    >
      <Sparkles className={q.unavailable ? "h-4 w-4 text-warn" : "h-4 w-4 text-primary"} />
      <span className="text-xs text-muted-foreground">{q.label}</span>
    </span>
  );
}
