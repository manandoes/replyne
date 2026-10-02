import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@shared/brand";
import type { MeResponse } from "@shared/contracts";
import { Alert, Button, Spinner } from "@shared/ui";
import { ApiError, createApiClient } from "../api";
import { clearAuth, getAuth } from "../storage";
import { Composer } from "./Composer";
import { ConnectView } from "./ConnectView";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

type Phase =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string }
  | { kind: "ready"; me: MeResponse };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const api = useMemo(
    () => createApiClient({ baseUrl: API_BASE_URL, getToken: async () => (await getAuth())?.token ?? null }),
    []
  );

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    if (!(await getAuth())) {
      setPhase({ kind: "signedOut" });
      return;
    }
    try {
      setPhase({ kind: "ready", me: await api.me() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearAuth();
        setPhase({ kind: "signedOut" });
      } else {
        setPhase({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      }
    }
  }, [api]);

  useEffect(() => {
    // Initial load from extension storage and the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Pick up profile or membership changes made in the dashboard when the panel
  // is shown again, without resetting what the user is composing.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible" || !(await getAuth())) return;
      try {
        const me = await api.me();
        setPhase((current) => (current.kind === "ready" ? { kind: "ready", me } : current));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearAuth();
          setPhase({ kind: "signedOut" });
        }
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [api]);

  const handleUnauthorized = useCallback(async () => {
    await clearAuth();
    setPhase({ kind: "signedOut" });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } catch {
      // Signing out locally still matters if the server is unreachable.
    }
    await clearAuth();
    setPhase({ kind: "signedOut" });
  }, [api]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
        {phase.kind === "ready" && (
          <Button variant="ghost" size="sm" onClick={() => void signOut()} title={phase.me.user.email}>
            Sign out
          </Button>
        )}
      </header>
      <main className="flex-1 p-3">
        {phase.kind === "loading" && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" aria-live="polite">
            <Spinner /> Loading your workspaces…
          </div>
        )}
        {phase.kind === "signedOut" && <ConnectView api={api} onConnected={() => void load()} />}
        {phase.kind === "error" && (
          <Alert
            tone="danger"
            title="Couldn't load your account"
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            }
          >
            {phase.message}
          </Alert>
        )}
        {phase.kind === "ready" && (
          <Composer api={api} me={phase.me} onUnauthorized={() => void handleUnauthorized()} />
        )}
      </main>
    </div>
  );
}
