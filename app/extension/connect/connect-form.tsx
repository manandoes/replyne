"use client";

import { useState, type FormEvent } from "react";
import type { ApiErrorBody } from "@shared/contracts";
import { Alert, Button, Input, Label } from "@shared/ui";

type Result =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "done"; approved: boolean; clientLabel: string };

/** Formats input as XXXX-XXXX while the user types. */
function formatCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}

export function ConnectForm() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function decide(decision: "approve" | "deny") {
    setPending(decision);
    setResult({ kind: "idle" });
    try {
      const response = await fetch("/api/ext/pair/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code, decision }),
      });
      const body = (await response.json().catch(() => null)) as
        | { status: "APPROVED" | "DENIED"; clientLabel: string }
        | ApiErrorBody
        | null;
      if (!response.ok || !body || !("status" in body)) {
        const message = body && "error" in body ? body.error : "Something went wrong. Try again.";
        setResult({ kind: "error", message });
        return;
      }
      setResult({ kind: "done", approved: body.status === "APPROVED", clientLabel: body.clientLabel });
    } catch {
      setResult({ kind: "error", message: "Couldn't reach the server. Check your connection." });
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void decide("approve");
  }

  if (result.kind === "done") {
    return result.approved ? (
      <Alert tone="success" title="Extension connected">
        {result.clientLabel} is now signed in to your account. You can close this tab and return to the
        side panel.
      </Alert>
    ) : (
      <Alert tone="neutral" title="Request denied">
        The extension was not connected. If you didn&apos;t start this, no action is needed.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">Code shown in the extension</Label>
        <Input
          id="code"
          name="code"
          value={code}
          onChange={(event) => setCode(formatCode(event.target.value))}
          placeholder="BCDF-GHJK"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-11 text-center font-mono text-lg tracking-[0.3em]"
          required
          autoFocus
        />
      </div>
      <Alert tone="warning">
        Only continue if you opened this page from your own browser extension just now and the code
        matches. Never enter a code someone else sent you.
      </Alert>
      {result.kind === "error" && <Alert tone="danger">{result.message}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={code.length !== 9 || pending !== null}>
          {pending === "approve" ? "Connecting…" : "Connect extension"}
        </Button>
        <Button
          variant="secondary"
          disabled={code.length !== 9 || pending !== null}
          onClick={() => void decide("deny")}
        >
          {pending === "deny" ? "Denying…" : "Deny"}
        </Button>
      </div>
    </form>
  );
}
