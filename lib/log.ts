/**
 * Structured server logging that never writes secrets or content.
 *
 * Keys that could carry tokens, credentials, Reddit text, draft text, or
 * personal data are replaced with "[redacted]"; long strings are truncated.
 */

const SENSITIVE_KEY =
  /token|secret|password|authorization|cookie|apikey|api_key|text|content|body|prompt|note|email|reply|captured/i;
const MAX_STRING = 200;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return {
      name: value.name,
      message: redact(value.message, depth + 1),
      ...(code === undefined ? {} : { code: String(code) }),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function logError(event: string, context: Record<string, unknown>, cause?: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      at: new Date().toISOString(),
      context: redact(context),
      ...(cause === undefined ? {} : { cause: redact(cause) }),
    })
  );
}

export function logInfo(event: string, context: Record<string, unknown>): void {
  console.info(
    JSON.stringify({ level: "info", event, at: new Date().toISOString(), context: redact(context) })
  );
}
