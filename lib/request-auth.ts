import type { NextResponse } from "next/server";
import { forbidden, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { authenticateExtensionToken } from "@/lib/extension-auth";

/**
 * Resolves who is calling an API route:
 *  - the browser extension, with `Authorization: Bearer <extension token>`, or
 *  - the dashboard, with the Auth.js session cookie.
 *
 * Cookie-authenticated writes must come from our own origin (CSRF defense).
 * Bearer requests can't be forged cross-site, so they skip that check.
 */

export type RequestUser =
  | { id: string; via: "extension"; extensionSessionId: string }
  | { id: string; via: "session" };

type AuthResult = { ok: true; user: RequestUser } | { ok: false; response: NextResponse };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(appUrl()).origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin";
}

export async function authenticateRequest(
  request: Request,
  options: { allow?: "any" | "session" | "extension" } = {}
): Promise<AuthResult> {
  const allow = options.allow ?? "any";
  const header = request.headers.get("authorization");

  if (header) {
    if (allow === "session") return { ok: false, response: forbidden() };
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const session = match?.[1] ? await authenticateExtensionToken(match[1]) : null;
    if (!session) {
      return { ok: false, response: unauthorized("Your extension session expired. Reconnect to continue.") };
    }
    return {
      ok: true,
      user: { id: session.userId, via: "extension", extensionSessionId: session.sessionId },
    };
  }

  if (allow === "extension") return { ok: false, response: unauthorized() };

  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthorized() };
  if (!SAFE_METHODS.has(request.method) && !isSameOriginRequest(request)) {
    return { ok: false, response: forbidden("Cross-site request blocked.") };
  }
  return { ok: true, user: { id: user.id, via: "session" } };
}
