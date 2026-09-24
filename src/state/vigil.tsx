import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACTION_META,
  ALERTS,
  DECISION_HISTORY,
  DEFAULT_THRESHOLDS,
  IRREVERSIBLE_ACTIONS,
  seedDecisionsFromAlerts,
  type ActionType,
  type Alert,
  type Decision,
} from "@/data/vigilai";

type Thresholds = { cost: number; confidence: number };

type VigilState = {
  alerts: Alert[];
  decisions: Decision[];
  thresholds: Thresholds;
  setThresholds: (t: Partial<Thresholds>) => void;
  approve: (alertId: string, optionId: string, human?: string) => void;
  reject: (alertId: string, human?: string) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  kpis: {
    activeAlerts: number;
    decisionsToday: number;
    autoPct: number;
    escalatedPct: number;
    hoursSaved: number;
  };
};

const Ctx = createContext<VigilState | null>(null);

let seq = 3000;

export function VigilProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>(ALERTS);
  const [decisions, setDecisions] = useState<Decision[]>(() => [
    ...seedDecisionsFromAlerts(),
    ...DECISION_HISTORY,
  ]);
  const [thresholds, setThresholdsState] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setThresholds = useCallback((t: Partial<Thresholds>) => {
    setThresholdsState((prev) => ({ ...prev, ...t }));
  }, []);

  const resolve = useCallback(
    (alertId: string, optionId: string | null, human: string, rejected: boolean) => {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, status: rejected ? "rejected" : "auto_executed" } : a,
        ),
      );
      setDecisions((prev) => {
        const alert = alerts.find((a) => a.id === alertId);
        if (!alert) return prev;
        const option =
          alert.options.find((o) => o.id === (optionId ?? alert.recommendedOptionId)) ??
          alert.options[0]!;
        const row: Decision = {
          id: `DEC-${++seq}`,
          alertId,
          timestamp: new Date().toISOString(),
          category: alert.category,
          action: option.action as ActionType,
          mode: "human",
          human,
          cost: rejected ? 0 : option.cost,
          confidence: alert.confidence,
          status: rejected ? "rejected" : "approved",
          outcome: "pending",
        };
        return [row, ...prev];
      });
    },
    [alerts],
  );

  const approve = useCallback(
    (alertId: string, optionId: string, human = "A. Mehta") =>
      resolve(alertId, optionId, human, false),
    [resolve],
  );
  const reject = useCallback(
    (alertId: string, human = "A. Mehta") => resolve(alertId, null, human, true),
    [resolve],
  );

  const kpis = useMemo(() => {
    const activeAlerts = alerts.filter((a) => a.status === "pending").length;
    const todayKey = "2026-09-18";
    const today = decisions.filter((d) => d.timestamp.slice(0, 10) >= todayKey);
    const decisionsToday = today.length || 14;
    const auto = decisions.filter((d) => d.mode === "auto").length;
    const autoPct = Math.round((auto / decisions.length) * 100);
    const hoursSaved = Math.round(auto * 0.45 * 10) / 10;
    return {
      activeAlerts,
      decisionsToday,
      autoPct,
      escalatedPct: 100 - autoPct,
      hoursSaved,
    };
  }, [alerts, decisions]);

  const value: VigilState = {
    alerts,
    decisions,
    thresholds,
    setThresholds,
    approve,
    reject,
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    kpis,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVigil() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVigil must be used inside VigilProvider");
  return v;
}

export function gateVerdict(
  cost: number,
  confidence: number,
  action: ActionType,
  thresholds: Thresholds,
) {
  const irreversible = IRREVERSIBLE_ACTIONS.includes(action);
  const costOk = cost <= thresholds.cost;
  const confOk = confidence >= thresholds.confidence;
  const auto = costOk && confOk && !irreversible;
  return {
    irreversible,
    costOk,
    confOk,
    auto,
    label: ACTION_META[action].label,
  };
}
