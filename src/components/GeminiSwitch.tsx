import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { geminiSwitchState } from "@/lib/webrun";
import { useVigil } from "@/state/vigil";

/** "Use Gemini AI" switch with the calls left today (or why it is disabled). */
export function GeminiSwitch({
  checked,
  onChange,
  busy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** A run is in flight: the switch is locked. */
  busy?: boolean;
}) {
  const { llm } = useVigil();
  const st = geminiSwitchState(llm);
  return (
    <label
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      title={st.label}
    >
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="font-medium">Use Gemini AI</span>
      <Switch
        checked={checked && !st.disabled}
        onCheckedChange={onChange}
        disabled={st.disabled || busy}
        aria-label="Use Gemini AI"
      />
      <span className="text-xs text-muted-foreground">{st.label}</span>
    </label>
  );
}
