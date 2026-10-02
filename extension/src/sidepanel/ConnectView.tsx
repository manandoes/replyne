import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "@shared/brand";
import type { StartPairingResponse } from "@shared/contracts";
import { Alert, Button, Spinner } from "@shared/ui";
import type { ApiClient } from "../api";
import { setAuth } from "../storage";

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; pairing: StartPairingResponse }
  | { kind: "failed"; message: string };

function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = ua.includes("Edg/") ? "Edge" : "Chrome";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac OS") ? "macOS" : ua.includes("Linux") ? "Linux" : "desktop";
  return `${browser} on ${os}`;
}

/**
 * Device-style sign-in: show a code, open the dashboard, and wait for the
 * signed-in user to type the code and approve. No password ever enters the extension.
 */
export function ConnectView({ api, onConnected }: { api: ApiClient; onConnected: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function connect() {
    setState({ kind: "starting" });
    let pairing: StartPairingResponse;
    try {
      pairing = await api.startPairing(browserLabel());
    } catch (error) {
      setState({ kind: "failed", message: error instanceof Error ? error.message : "Couldn't start sign-in." });
      return;
    }
    setState({ kind: "waiting", pairing });
    void chrome.tabs.create({ url: pairing.verificationUri });

    const deadline = Date.now() + pairing.expiresIn * 1000;
    while (!cancelled.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pairing.interval * 1000));
      if (cancelled.current) return;
      try {
        const result = await api.pollPairing(pairing.deviceCode);
        if (result.status === "approved") {
          await setAuth({ token: result.token, expiresAt: result.expiresAt });
          onConnected();
          return;
        }
        if (result.status === "denied") {
          setState({ kind: "failed", message: "The request was denied in the dashboard." });
          return;
        }
        if (result.status === "expired") break;
      } catch {
        // Transient network problems: keep polling until the code expires.
      }
    }
    if (!cancelled.current) setState({ kind: "failed", message: "The code expired. Start again." });
  }

  if (state.kind === "waiting") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold">Enter this code in the dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We opened the {APP_NAME} connect page in a new tab. Sign in if asked, then type this code.
          </p>
        </div>
        <p
          className="rounded-md border border-border bg-surface py-3 text-center font-mono text-2xl font-semibold tracking-[0.25em]"
          aria-label={`Code ${state.pairing.userCode.split("").join(" ")}`}
        >
          {state.pairing.userCode}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Spinner /> Waiting for approval…
        </div>
        <Button variant="secondary" size="sm" onClick={() => void chrome.tabs.create({ url: state.pairing.verificationUri })}>
          Open the connect page again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold">Connect your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your {APP_NAME} dashboard account to draft replies with your team&apos;s brand profiles.
        </p>
      </div>
      {state.kind === "failed" && <Alert tone="danger">{state.message}</Alert>}
      <Button className="w-full" onClick={() => void connect()} disabled={state.kind === "starting"}>
        {state.kind === "starting" ? <Spinner label="Starting" /> : null}
        {state.kind === "starting" ? "Starting…" : "Connect"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {APP_NAME} only reads text you choose to send it, and never posts to Reddit for you.
      </p>
    </div>
  );
}
