import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
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
import { ApiError, api, type ApiHealth } from "@/lib/api";
import {
  kpisFromDemo,
  overrideNote,
  toAlert,
  toDecisions,
  toKpis,
  toThresholds,
  type DisplayKpis,
} from "@/lib/adapter";

type Thresholds = { cost: number; confidence: number };

/** connecting: first health check in flight. live: backend data. demo: mock data (backend offline). */
export type DataMode = "connecting" | "live" | "demo";

type VigilState = {
  mode: DataMode;
  health: ApiHealth | null;
  alerts: Alert[];
  /** Alerts waiting for a human decision (live: from GET /queue). */
  pendingAlerts: Alert[];
  decisions: Decision[];
  thresholds: Thresholds;
  setThresholds: (t: Partial<Thresholds>) => void;
  resetThresholds: () => void;
  approve: (alertId: string, optionId: string) => Promise<void>;
  reject: (alertId: string) => Promise<void>;
  /** Alert id currently being reviewed (request in flight). */
  busyAlertId: string | null;
  reviewer: string;
  setReviewer: (name: string) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  kpis: DisplayKpis;
};

const Ctx = createContext<VigilState | null>(null);

const POLL_MS = 15_000;
const HEALTH_TIMEOUT_MS = 4_000;
const REVIEWER_KEY = "vigilai.reviewer";

let seq = 3000;

type LiveData = {
  alerts: Alert[];
  queueSeqs: Set<number>;
  decisions: Decision[];
  kpis: DisplayKpis;
  serverThresholds: Thresholds;
};

async function fetchLive(): Promise<LiveData> {
  const [views, queue, audit, th, k] = await Promise.all([
    api.alerts(),
    api.queue(),
    api.audit(),
    api.thresholds(),
    api.kpis(),
  ]);
  return {
    alerts: views.map(toAlert),
    queueSeqs: new Set(queue.map((r) => r.seq)),
    decisions: toDecisions(audit),
    kpis: toKpis(k),
    serverThresholds: toThresholds(th),
  };
}

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
}

function readReviewer(): string {
  try {
    return window.localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function VigilProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>("connecting");
  const modeRef = useRef<DataMode>("connecting");
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);

  // Demo (mock) data, used only when the backend cannot be reached.
  const [demoAlerts, setDemoAlerts] = useState<Alert[]>(ALERTS);
  const [demoDecisions, setDemoDecisions] = useState<Decision[]>(() => [
    ...seedDecisionsFromAlerts(),
    ...DECISION_HISTORY,
  ]);

  const [thresholds, setThresholdsState] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const thresholdsTouched = useRef(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [reviewer, setReviewerState] = useState("");
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    setReviewerState(readReviewer());
  }, []);

  const setReviewer = useCallback((name: string) => {
    setReviewerState(name);
    try {
      window.localStorage.setItem(REVIEWER_KEY, name);
    } catch {
      /* storage unavailable: keep it in memory only */
    }
  }, []);

  /** Health check, then (if reachable) a full data refresh. Never throws. */
  const sync = useCallback(async () => {
    let h: ApiHealth;
    try {
      h = await api.health(HEALTH_TIMEOUT_MS);
    } catch {
      if (modeRef.current === "live") {
        toast.warning("Backend went offline — showing demo data.", { id: "vigil-sync" });
      }
      modeRef.current = "demo";
      setHealth(null);
      setMode("demo");
      return;
    }
    try {
      const data = await fetchLive();
      if (modeRef.current === "demo") {
        toast.success("Backend reachable — showing live data.", { id: "vigil-sync" });
      }
      modeRef.current = "live";
      setHealth(h);
      setLive(data);
      if (!thresholdsTouched.current) setThresholdsState(data.serverThresholds);
      setMode("live");
    } catch (e) {
      // Health OK but a data call failed: keep the last good data, don't blank the page.
      toast.error(`Could not load data from the backend: ${errorText(e)}`, { id: "vigil-sync" });
      if (modeRef.current !== "live") {
        modeRef.current = "demo";
        setHealth(null);
        setMode("demo");
      }
    }
  }, []);

  useEffect(() => {
    void sync();
    const id = window.setInterval(() => void sync(), POLL_MS);
    return () => window.clearInterval(id);
  }, [sync]);

  const setThresholds = useCallback((t: Partial<Thresholds>) => {
    thresholdsTouched.current = true;
    setThresholdsState((prev) => ({ ...prev, ...t }));
  }, []);

  const resetThresholds = useCallback(() => {
    thresholdsTouched.current = false;
    setThresholdsState(live?.serverThresholds ?? DEFAULT_THRESHOLDS);
  }, [live]);

  const isLive = mode === "live" && live !== null;
  const alerts = useMemo(
    () => (isLive ? live.alerts : mode === "demo" ? demoAlerts : []),
    [isLive, live, mode, demoAlerts],
  );
  const decisions = useMemo(
    () => (isLive ? live.decisions : mode === "demo" ? demoDecisions : []),
    [isLive, live, mode, demoDecisions],
  );

  const pendingAlerts = useMemo(
    () =>
      isLive
        ? live.alerts.filter((a) => a.auditSeq !== undefined && live.queueSeqs.has(a.auditSeq))
        : alerts.filter((a) => a.status === "pending"),
    [isLive, live, alerts],
  );

  // ---------- review (approve / reject) ----------

  const resolveDemo = useCallback(
    (alertId: string, optionId: string | null, human: string, rejected: boolean) => {
      const alert = demoAlerts.find((a) => a.id === alertId);
      if (!alert) return;
      const recommended =
        alert.options.find((o) => o.id === alert.recommendedOptionId) ?? alert.options[0]!;
      const option = alert.options.find((o) => o.id === optionId) ?? recommended;
      setDemoAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, status: rejected ? "rejected" : "approved" } : a,
        ),
      );
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
      if (!rejected && option.id !== recommended.id) {
        row.override = { recommended: recommended.action, chosen: option.action };
      }
      setDemoDecisions((prev) => [row, ...prev]);
    },
    [demoAlerts],
  );

  const review = useCallback(
    async (alertId: string, verdict: "approve" | "reject", optionId: string | null) => {
      const name = reviewer.trim();
      if (!name) {
        toast.error("Enter your reviewer name in the header first.");
        return;
      }
      if (!isLive) {
        resolveDemo(alertId, optionId, name, verdict === "reject");
        return;
      }
      const alert = live.alerts.find((a) => a.id === alertId);
      if (!alert || alert.auditSeq === undefined) {
        toast.error(`Alert ${alertId} not found in backend data.`);
        return;
      }
      let note: string | null = null;
      if (verdict === "approve" && optionId && optionId !== alert.recommendedOptionId) {
        const rec = alert.options.find((o) => o.id === alert.recommendedOptionId);
        const chosen = alert.options.find((o) => o.id === optionId);
        if (rec?.backendAction && chosen?.backendAction) {
          note = overrideNote(rec.backendAction, chosen.backendAction);
        }
      }
      setBusyAlertId(alertId);
      try {
        await api.review(alert.auditSeq, { reviewer: name, verdict, note });
        toast.success(`${alertId} ${verdict === "approve" ? "approved" : "rejected"} by ${name}`);
      } catch (e) {
        toast.error(`Review failed: ${errorText(e)}`);
      } finally {
        await sync();
        setBusyAlertId(null);
      }
    },
    [reviewer, isLive, live, resolveDemo, sync],
  );

  const approve = useCallback(
    (alertId: string, optionId: string) => review(alertId, "approve", optionId),
    [review],
  );
  const reject = useCallback((alertId: string) => review(alertId, "reject", null), [review]);

  const kpis = useMemo<DisplayKpis>(
    () => (isLive ? live.kpis : kpisFromDemo(alerts, decisions)),
    [isLive, live, alerts, decisions],
  );

  const value: VigilState = {
    mode,
    health,
    alerts,
    pendingAlerts,
    decisions,
    thresholds,
    setThresholds,
    resetThresholds,
    approve,
    reject,
    busyAlertId,
    reviewer,
    setReviewer,
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

/**
 * Frontend mirror of the gate, used only for the what-if threshold preview.
 * `reversible` (from the backend option, when known) overrides the per-action-type default.
 */
export function gateVerdict(
  cost: number,
  confidence: number,
  action: ActionType,
  thresholds: Thresholds,
  reversible?: boolean,
) {
  const irreversible =
    reversible === undefined ? IRREVERSIBLE_ACTIONS.includes(action) : !reversible;
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
