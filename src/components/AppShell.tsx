import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Moon,
  Network,
  ScrollText,
  SlidersHorizontal,
  Sun,
  UserCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useVigil } from "@/state/vigil";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard },
  { to: "/alerts", label: "Live Alert Feed", icon: Activity },
  { to: "/pipeline", label: "Agent Pipeline", icon: GitBranch },
  { to: "/queue", label: "Decision Queue", icon: UserCheck },
  { to: "/thresholds", label: "Threshold Control", icon: SlidersHorizontal },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
  { to: "/evaluation", label: "Evaluation", icon: BarChart3 },
  { to: "/architecture", label: "System Architecture", icon: Network },
] as const;

const TECH_BADGES = ["LLM Agents", "RAG", "MCP", "Human-in-the-Loop"];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme, kpis, mode, health, user, logout } = useVigil();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const onLogin = pathname === "/login";
  // Live backend: every page needs a login. Demo mode (backend offline) needs none.
  const needsLogin = mode === "live" && !user;

  useEffect(() => {
    if (needsLogin && !onLogin) void navigate({ to: "/login" });
  }, [needsLogin, onLogin, navigate]);

  if (onLogin) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-all duration-300",
          collapsed ? "w-[74px]" : "w-[258px]",
        )}
      >
        <div className="px-4 pt-6">
          <div className="flex items-center gap-2.5">
            <div className="glow-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight">VigilAI</p>
              </div>
            )}
          </div>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-1 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              activeProps={{ className: "bg-primary/12 text-foreground font-medium" }}
              title={label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && to === "/queue" && kpis.activeAlerts > 0 && (
                <span className="ml-auto rounded-full bg-warn/20 px-1.5 text-[10px] font-semibold text-warn">
                  {kpis.activeAlerts}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-2 flex items-center justify-center gap-2 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-2"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {mode === "live" && health ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                </span>
                <span title={health.tool_servers.join(", ")}>
                  Backend online · {health.tool_servers.length} tool servers
                </span>
              </>
            ) : mode === "demo" ? (
              <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-semibold text-warn">
                Demo data (backend offline)
              </span>
            ) : (
              <span>Connecting to backend…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-xs" title={`Logged in as ${user.username}`}>
                  <span className="font-medium">{user.name}</span>{" "}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                      user.role === "reviewer" ? "bg-ok/20 text-ok" : "bg-primary/15 text-primary",
                    )}
                  >
                    {user.role}
                  </span>
                </span>
                <button
                  onClick={() => void logout()}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </button>
              </>
            ) : mode === "demo" ? (
              <span className="text-xs text-muted-foreground">Demo mode · no login needed</span>
            ) : null}
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          {mode === "connecting" || needsLogin ? (
            <p className="panel p-10 text-center text-sm text-muted-foreground">
              Loading data from the backend…
            </p>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
