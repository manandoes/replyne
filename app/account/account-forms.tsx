"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, Input, Label } from "@shared/ui";
import { mutate } from "@/components/api-client";
import { ConfirmButton } from "@/components/confirm-button";

export function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await mutate("/api/account", "PATCH", { name: value });
    setPending(false);
    if (!result.ok) return setMessage({ tone: "danger", text: result.fieldErrors.name ?? result.error });
    setMessage({ tone: "success", text: "Name updated." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input id="account-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required />
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending || value.trim() === name}>
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setError(null);
    if (next !== confirm) return setErrors({ confirm: "The new passwords don't match." });
    setPending(true);
    const result = await mutate("/api/account/password", "POST", { currentPassword: current, newPassword: next });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      if (Object.keys(result.fieldErrors).length === 0) setError(result.error);
      return;
    }
    // Every dashboard session (this one too) is now signed out.
    router.push("/login?reason=password_changed");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        {errors.currentPassword && <p className="text-xs text-danger">{errors.currentPassword}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          {errors.newPassword ? (
            <p className="text-xs text-danger">{errors.newPassword}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least 10 characters.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {errors.confirm && <p className="text-xs text-danger">{errors.confirm}</p>}
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
      <p className="text-xs text-muted-foreground">Changing your password signs you out of the dashboard everywhere.</p>
    </form>
  );
}

type Session = { id: string; label: string; connected: string; lastUsed: string; expires: string };

export function ExtensionSessions({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No browser extensions are connected. Load the extension, click its toolbar icon, then choose Connect.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{session.label}</p>
              <p className="text-xs text-muted-foreground">
                Connected {session.connected} · last used {session.lastUsed} · expires {session.expires}
              </p>
            </div>
            <ConfirmButton
              size="sm"
              title={`Sign out ${session.label}?`}
              description="That extension will need to connect again before it can draft."
              confirmLabel="Sign out extension"
              onConfirm={async () => {
                const result = await mutate(`/api/account/extension-sessions/${session.id}`, "DELETE");
                if (!result.ok) return result.error;
                router.refresh();
                return null;
              }}
            >
              Sign out
            </ConfirmButton>
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <ConfirmButton
          size="sm"
          title="Sign out every extension?"
          description="All connected browsers will need to connect again."
          confirmLabel="Sign out all"
          onConfirm={async () => {
            const result = await mutate("/api/account/extension-sessions", "DELETE");
            if (!result.ok) return result.error;
            router.refresh();
            return null;
          }}
        >
          Sign out all extensions
        </ConfirmButton>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}
