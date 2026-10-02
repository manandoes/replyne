import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@shared/contracts";
import { logError } from "@/lib/log";

/**
 * Consistent API responses: errors are `{ error, code, fieldErrors? }` and
 * never include stack traces or raw database/provider messages.
 */

export function apiError(message: string, status: number, code: string, init?: ResponseInit) {
  return NextResponse.json<ApiErrorBody>({ error: message, code }, { ...init, status });
}

export const unauthorized = (message = "Sign in to continue.") =>
  apiError(message, 401, "unauthorized");

export const forbidden = (message = "You don't have permission to do that.") =>
  apiError(message, 403, "forbidden");

/** Also used when a record exists but belongs to a workspace the caller can't see. */
export const notFound = (message = "Not found.") => apiError(message, 404, "not_found");

export function rateLimited(
  retryAfterSeconds: number,
  message = "Too many requests. Try again shortly."
) {
  return apiError(message, 429, "rate_limited", {
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });
}

export function validationError(error: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".");
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return NextResponse.json<ApiErrorBody>(
    {
      error: error.issues[0]?.message ?? "Please check the request.",
      code: "validation_error",
      fieldErrors,
    },
    { status: 400 }
  );
}

/**
 * A refusal from a service function (lib/*). Services return these instead of
 * throwing, so every route turns them into the same JSON error shape.
 */
export type ServiceFailure = { ok: false; status: number; code: string; message: string; field?: string };

export function fail(status: number, code: string, message: string, field?: string): ServiceFailure {
  return { ok: false, status, code, message, ...(field ? { field } : {}) };
}

export function failureResponse(failure: ServiceFailure) {
  return NextResponse.json<ApiErrorBody>(
    {
      error: failure.message,
      code: failure.code,
      ...(failure.field ? { fieldErrors: { [failure.field]: failure.message } } : {}),
    },
    { status: failure.status }
  );
}

export function serverError(context: Record<string, unknown>, cause: unknown) {
  logError("api.server_error", context, cause);
  return apiError("Something went wrong. Please try again.", 500, "server_error");
}

/** Parses and validates a JSON body; returns a ready error response on failure. */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: apiError("Request body must be JSON.", 400, "invalid_json") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
  return { ok: true, data: parsed.data };
}

/** Best-effort client IP for rate-limit keys (trust depends on the proxy in front). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
