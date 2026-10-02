"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Input, type ButtonVariant } from "@shared/ui";

/**
 * A button that opens a native modal <dialog> to confirm a consequential
 * action. With `confirmText`, the user must type it (e.g. a workspace name).
 * `onConfirm` returns an error message to show, or null on success.
 */
export function ConfirmButton({
  children,
  variant = "danger",
  size = "md",
  title,
  description,
  confirmLabel,
  confirmText,
  onConfirm,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmText?: string;
  onConfirm: (typed: string) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const open = () => {
    setTyped("");
    setError(null);
    dialog.current?.showModal();
  };

  async function confirm() {
    setPending(true);
    setError(null);
    const message = await onConfirm(typed);
    setPending(false);
    if (message) setError(message);
    else dialog.current?.close();
  }

  const matches = confirmText === undefined || typed.trim() === confirmText.trim();
  const destructive = variant === "danger" || variant === "destructive";

  return (
    <>
      <Button variant={variant} size={size} onClick={open}>
        {children}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches) void confirm();
          }}
        >
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          {confirmText !== undefined && (
            <Input
              aria-label={`Type ${confirmText} to confirm`}
              placeholder={confirmText}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => dialog.current?.close()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "primary"} disabled={pending || !matches}>
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
