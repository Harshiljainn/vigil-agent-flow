import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, LogIn } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useVigil } from "@/state/vigil";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — VigilAI" },
      { name: "description", content: "Log in to VigilAI as an operator or a reviewer." },
    ],
  }),
  component: Login,
});

function Login() {
  const { mode, waking, user, login } = useVigil();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) void navigate({ to: "/" });
  }, [user, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await login(username.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else setPassword("");
  };

  const field = "h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="glow-ring flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">VigilAI</p>
            <p className="text-xs text-muted-foreground">Log in to continue</p>
          </div>
        </div>

        {mode === "demo" ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-warn/12 px-3 py-2 text-warn">
              The backend is offline, so VigilAI is showing demo data. Demo mode needs no login.
            </p>
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Continue with demo data
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className={field}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={field}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || mode !== "live" || !username.trim() || !password}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {busy
                ? "Logging in…"
                : mode === "connecting"
                  ? waking
                    ? "Waking up the backend (up to 1 minute)…"
                    : "Connecting to backend…"
                  : "Log in"}
            </button>
            <p className="text-xs text-muted-foreground">
              Operators can view everything and run scenarios. Reviewers can also approve or reject
              escalations and change thresholds. Accounts are created on the backend with{" "}
              <code className="font-mono">python -m vigilai.users create</code>.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
