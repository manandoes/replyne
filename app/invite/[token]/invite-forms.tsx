"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Label } from "@shared/ui";
import type { InviteFormState } from "./actions";

type Action = (previous: InviteFormState, formData: FormData) => Promise<InviteFormState>;

export function AcceptInviteForm({ action, workspaceName }: { action: Action; workspaceName: string }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Joining…" : `Join ${workspaceName}`}
      </Button>
    </form>
  );
}

export function RegisterFromInviteForm({ action, email }: { action: Action; email: string }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={email} readOnly className="bg-surface-muted" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" maxLength={80} required autoFocus />
        {state.fieldErrors?.name && <p className="text-xs text-danger">{state.fieldErrors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        {state.fieldErrors?.password ? (
          <p className="text-xs text-danger">{state.fieldErrors.password}</p>
        ) : (
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        {state.fieldErrors?.confirm && <p className="text-xs text-danger">{state.fieldErrors.confirm}</p>}
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating your account…" : "Create account and join"}
      </Button>
    </form>
  );
}
