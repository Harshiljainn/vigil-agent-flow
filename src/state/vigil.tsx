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
import { WAKE_MAX_MS, WAKE_NOTICE_MS, WAKE_RETRY_MS } from "@/lib/config";
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
import {
  ApiError,
  api,
  setAuthToken,
  setUnauthorizedHandler,
  type ApiHealth,
  type ApiLlmStatus,
  type ApiUser,
} from "@/lib/api";
import {
  kpisFromDemo,
  sessionExpired,
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
  /** True when the first /health call has been pending for more than ~2 s (backend waking up). */
  waking: boolean;
  health: ApiHealth | null;
  alerts: Alert[];
  /** Alerts waiting for a human decision (live: from GET /queue). */
  pendingAlerts: Alert[];
  decisions: Decision[];
  thresholds: Thresholds;
  setThresholds: (t: Partial<Thresholds>) => void;
  resetThresholds: () => void;
  /** Thresholds the backend is using now (live only). */
  serverThresholds: Thresholds | null;
  /** PUT /thresholds with the current slider values (live only). Affects new decisions only. */
  applyThresholds: () => Promise<boolean>;
  /** Re-fetch everything from the backend now. */
  refresh: () => Promise<void>;
  /** GET /llm/status (Gemini key present, calls left today); null until loaded or in demo mode. */
  llm: ApiLlmStatus | null;
  refreshLlm: () => Promise<void>;
  approve: (alertId: string, optionId: string) => Promise<void>;
  reject: (alertId: string) => Promise<void>;
  /** Alert id currently being reviewed (request in flight). */
  busyAlertId: string | null;
  /** Logged-in user (live mode). Demo mode needs no login, so it is null there. */
  user: ApiUser | null;
  /** Live: a reviewer is logged in. Demo: always true (no backend, no login). */
  canReview: boolean;
  /** Live: anyone logged in (operator or reviewer). Demo: always true. */
  canOperate: boolean;
  /** POST /auth/login. Resolves to an error message, or null on success. */
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  theme: "dark" | "light";
  toggleTheme: () => void;
  kpis: DisplayKpis;
};

const Ctx = createContext<VigilState | null>(null);

const POLL_MS = 15_000;
const HEALTH_TIMEOUT_MS = 4_000;
const SESSION_KEY = "vigilai.session";
/** Name recorded on demo-mode reviews (demo mode has no backend and no login). */
const DEMO_REVIEWER = "Demo reviewer";

type Session = { token: string; expiresAt: string; user: ApiUser };

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
    kpis: toKpis(k, audit),
    serverThresholds: toThresholds(th),
  };
}

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
}

function readSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.token || !s.user || sessionExpired(s.expiresAt)) return null;
    return s;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the session lives in memory only */
  }
}

export function VigilProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DataMode>("connecting");
  const modeRef = useRef<DataMode>("connecting");
  const [waking, setWaking] = useState(false);
  const startedAt = useRef(Date.now());
  const inFlight = useRef(false);
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
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionChecked = useRef(false);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setSession = useCallback((s: Session | null) => {
    setAuthToken(s?.token ?? null);
    writeSession(s);
    setSessionState(s);
  }, []);

  useEffect(() => {
    setSession(readSession());
    setUnauthorizedHandler(() => {
      setSession(null);
      toast.error("Session expired or ended. Please log in again.", { id: "vigil-auth" });
    });
    return () => setUnauthorizedHandler(null);
  }, [setSession]);

  /** Health check, then (if reachable) a full data refresh. Never throws. */
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await syncOnce();
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncOnce = useCallback(async () => {
    let h: ApiHealth;
    try {
      h = await api.health(HEALTH_TIMEOUT_MS);
    } catch {
      if (modeRef.current === "connecting" && Date.now() - startedAt.current < WAKE_MAX_MS) {
        return; // first load: the backend may be waking up, keep retrying before demo mode
      }
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
      if (!sessionChecked.current) {
        sessionChecked.current = true;
        const stored = readSession();
        if (stored) {
          // the backend may have been reset or the session ended: confirm the token once
          await api.me().then(
            (m) => setSession({ ...stored, user: m.user, expiresAt: m.expires_at }),
            () => setSession(null),
          );
        }
      }
      setWaking(false);
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
  }, [setSession]);

  useEffect(() => {
    void sync();
    const id = window.setInterval(() => void sync(), POLL_MS);
    // while the first answer is pending, retry quickly instead of waiting for the 15 s recheck
    const retry = window.setInterval(() => {
      if (modeRef.current === "connecting") void sync();
    }, WAKE_RETRY_MS);
    const notice = window.setTimeout(() => {
      if (modeRef.current === "connecting") setWaking(true);
    }, WAKE_NOTICE_MS);
    return () => {
      window.clearInterval(id);
      window.clearInterval(retry);
      window.clearTimeout(notice);
    };
  }, [sync]);

  useEffect(() => {
    if (mode !== "connecting") setWaking(false);
  }, [mode]);

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

  const user = isLive ? (session?.user ?? null) : null;
  const canReview = mode === "demo" || user?.role === "reviewer";
  const canOperate = mode === "demo" || user !== null;

  const [llm, setLlm] = useState<ApiLlmStatus | null>(null);
  const refreshLlm = useCallback(async () => {
    try {
      setLlm(await api.llmStatus());
    } catch {
      setLlm(null);
    }
  }, []);
  const loggedIn = user !== null;
  useEffect(() => {
    if (isLive && loggedIn) void refreshLlm();
    else setLlm(null);
  }, [isLive, loggedIn, refreshLlm]);

  const review = useCallback(
    async (alertId: string, verdict: "approve" | "reject", optionId: string | null) => {
      if (!isLive) {
        resolveDemo(alertId, optionId, DEMO_REVIEWER, verdict === "reject");
        return;
      }
      if (!canReview || !user) {
        toast.error("Only a reviewer can approve or reject. Log in as a reviewer.");
        return;
      }
      const alert = live.alerts.find((a) => a.id === alertId);
      if (!alert || alert.auditSeq === undefined) {
        toast.error(`Alert ${alertId} not found in backend data.`);
        return;
      }
      // Modify & Approve: send the chosen option's backend action; the backend stores that
      // option's own action, cost, confidence and reversibility and marks it as an override.
      let chosenAction: string | null = null;
      if (verdict === "approve" && optionId && optionId !== alert.recommendedOptionId) {
        chosenAction = alert.options.find((o) => o.id === optionId)?.backendAction ?? null;
        if (!chosenAction) {
          toast.error(`Option ${optionId} not found in backend data.`);
          return;
        }
      }
      setBusyAlertId(alertId);
      try {
        await api.review(alert.auditSeq, {
          verdict,
          ...(chosenAction ? { chosen_action: chosenAction } : {}),
        });
        toast.success(
          `${alertId} ${verdict === "approve" ? "approved" : "rejected"} by ${user.name}`,
        );
      } catch (e) {
        toast.error(`Review failed: ${errorText(e)}`);
      } finally {
        await sync();
        setBusyAlertId(null);
      }
    },
    [canReview, user, isLive, live, resolveDemo, sync],
  );

  const approve = useCallback(
    (alertId: string, optionId: string) => review(alertId, "approve", optionId),
    [review],
  );
  const reject = useCallback((alertId: string) => review(alertId, "reject", null), [review]);

  const applyThresholds = useCallback(async () => {
    if (!isLive) {
      toast.error("No backend: thresholds can only be applied when the backend is running.");
      return false;
    }
    if (!canReview) {
      toast.error("Only a reviewer can change thresholds.");
      return false;
    }
    try {
      const t = await api.putThresholds({
        cost_limit_usd: thresholds.cost,
        confidence_min: thresholds.confidence / 100,
      });
      thresholdsTouched.current = false;
      toast.success(
        `Thresholds applied: cost ≤ ${t.cost_limit_usd}, confidence ≥ ${t.confidence_min}. New decisions only.`,
      );
      await sync();
      return true;
    } catch (e) {
      toast.error(`Apply failed: ${errorText(e)}`);
      return false;
    }
  }, [isLive, canReview, thresholds, sync]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const r = await api.login(username, password);
        setSession({ token: r.token, expiresAt: r.expires_at, user: r.user });
        sessionChecked.current = true;
        toast.success(`Logged in as ${r.user.name} (${r.user.role})`, { id: "vigil-auth" });
        return null;
      } catch (e) {
        return e instanceof ApiError && e.status === 401
          ? "Wrong username or password."
          : errorText(e);
      }
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* already expired or backend offline: forget the token anyway */
    }
    setSession(null);
  }, [setSession]);

  // drop the session when it runs out while the page is open
  useEffect(() => {
    if (!session) return;
    const ms = Date.parse(session.expiresAt) - Date.now();
    const id = window.setTimeout(() => setSession(null), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [session, setSession]);

  const kpis = useMemo<DisplayKpis>(
    () => (isLive ? live.kpis : kpisFromDemo(alerts, decisions)),
    [isLive, live, alerts, decisions],
  );

  const value: VigilState = {
    mode,
    waking,
    health,
    alerts,
    pendingAlerts,
    decisions,
    thresholds,
    setThresholds,
    resetThresholds,
    serverThresholds: isLive ? live.serverThresholds : null,
    applyThresholds,
    refresh: sync,
    llm,
    refreshLlm,
    approve,
    reject,
    busyAlertId,
    user,
    canReview,
    canOperate,
    login,
    logout,
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
