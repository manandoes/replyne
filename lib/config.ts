/**
 * Server configuration read from the environment. Secrets never reach the
 * client or the extension.
 */

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Hours to keep user-captured Reddit text (capped at 30 days). */
export function capturedTextRetentionHours(): number {
  const parsed = Number(process.env.CAPTURED_TEXT_RETENTION_HOURS ?? "48");
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 24 * 30) : 48;
}
