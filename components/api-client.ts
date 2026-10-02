import type { ApiErrorBody } from "@shared/contracts";

/**
 * Same-origin fetch for dashboard forms. The browser sends the Origin header
 * and session cookie; errors come back in the standard `{ error, fieldErrors }`
 * shape so forms can mark the right field.
 */
export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fieldErrors: Record<string, string> };

export async function mutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<MutationResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection.", fieldErrors: {} };
  }
  if (response.status === 204) return { ok: true, data: undefined as T };

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = (json ?? {}) as Partial<ApiErrorBody>;
    return {
      ok: false,
      status: response.status,
      error:
        response.status === 401
          ? "Your session ended. Sign in again."
          : (payload.error ?? "Something went wrong. Try again."),
      fieldErrors: payload.fieldErrors ?? {},
    };
  }
  return { ok: true, data: json as T };
}
