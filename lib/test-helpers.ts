import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { EXTENSION_SESSION_TTL_DAYS, generateSecret, hashSecret } from "@/lib/extension-auth";
import type { Role } from "@/lib/generated/prisma/enums";

/**
 * Fixtures for tests against the real (test) database. Every record gets a
 * random suffix, so parallel files never collide and nothing needs cleanup.
 */

export const suffix = () => randomUUID().slice(0, 8);

export async function createUser(name = "Test User") {
  return db.user.create({
    data: { email: `user-${suffix()}@example.com`, name },
    select: { id: true, email: true },
  });
}

export async function createWorkspace(ownerId: string) {
  return db.workspace.create({
    data: { name: `Workspace ${suffix()}`, memberships: { create: { userId: ownerId, role: "OWNER" } } },
    select: { id: true },
  });
}

export async function addMember(workspaceId: string, role: Role) {
  const user = await createUser(`${role} member`);
  await db.membership.create({ data: { workspaceId, userId: user.id, role } });
  return user;
}

export async function createProfile(
  workspaceId: string,
  overrides: Partial<{
    brandName: string;
    facts: string[];
    prohibitedClaims: string[];
    linkPolicy: "NEVER" | "ALLOWED_DOMAINS";
    allowedLinkDomains: string[];
    disclosure: string;
  }> = {}
) {
  return db.brandProfile.create({
    data: {
      workspaceId,
      name: `Profile ${suffix()}`,
      brandName: overrides.brandName ?? "Acme",
      facts: overrides.facts ?? ["Acme has a free plan for up to 3 users."],
      prohibitedClaims: overrides.prohibitedClaims ?? [],
      linkPolicy: overrides.linkPolicy ?? "NEVER",
      allowedLinkDomains: overrides.allowedLinkDomains ?? [],
      disclosure: overrides.disclosure ?? "",
    },
  });
}

/** A working extension bearer token for `userId`. */
export async function createExtensionToken(userId: string) {
  const token = generateSecret("rl_ext_");
  await db.extensionSession.create({
    data: {
      userId,
      tokenHash: hashSecret(token),
      label: "Test browser",
      expiresAt: new Date(Date.now() + EXTENSION_SESSION_TTL_DAYS * 86_400_000),
    },
  });
  return token;
}

/** A tenant with an owner, a brand profile, and an extension token. */
export async function createTenant() {
  const owner = await createUser("Owner");
  const workspace = await createWorkspace(owner.id);
  const profile = await createProfile(workspace.id);
  const token = await createExtensionToken(owner.id);
  return { owner, workspace, profile, token };
}

export function apiRequest(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

/** A dashboard request: session cookie auth (mocked per test file) from our own origin. */
export function dashboardRequest(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  return apiRequest(path, {
    method: init.method,
    body: init.body,
    headers: { origin: init.origin ?? "http://localhost:3000" },
  });
}

/**
 * Pairs with `vi.mock("@/lib/auth", ...)` in a test file: whoever is stored
 * here is the signed-in dashboard user for the next request.
 */
export type SessionHolder = { current: { id: string; email: string; name: string } | null };
export const signInAs = (holder: SessionHolder, user: { id: string; email: string } | null) => {
  holder.current = user ? { id: user.id, email: user.email, name: "Test User" } : null;
};
