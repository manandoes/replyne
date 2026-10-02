import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { DELETE as revokeAll } from "@/app/api/account/extension-sessions/route";
import { DELETE as revokeOne } from "@/app/api/account/extension-sessions/[sessionId]/route";
import { POST as changePassword } from "@/app/api/account/password/route";
import { GET as me } from "@/app/api/ext/me/route";
import { db } from "@/lib/db";
import { hashSecret } from "@/lib/extension-auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { apiRequest, createExtensionToken, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("account", () => {
  it("changes the password only with the current one, and signs out every dashboard session", async () => {
    const { owner } = await createTenant();
    await db.user.update({ where: { id: owner.id }, data: { passwordHash: await hashPassword("original password 1") } });
    signInAs(session, owner);
    const change = (currentPassword: string, newPassword: string) =>
      changePassword(dashboardRequest("/api/account/password", { method: "POST", body: { currentPassword, newPassword } }));

    const wrong = await change("not it", "a brand new password");
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { fieldErrors: Record<string, string> }).fieldErrors).toHaveProperty("currentPassword");
    expect((await change("original password 1", "short")).status).toBe(400);

    expect((await change("original password 1", "a brand new password")).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(user.sessionVersion).toBe(1);
    expect(await verifyPassword("a brand new password", user.passwordHash!)).toBe(true);
  });

  it("revokes only the caller's own extension sessions", async () => {
    const a = await createTenant();
    const b = await createTenant();
    const bSession = await db.extensionSession.findUniqueOrThrow({ where: { tokenHash: hashSecret(b.token) } });

    signInAs(session, a.owner);
    const foreign = await revokeOne(dashboardRequest(`/api/account/extension-sessions/${bSession.id}`, { method: "DELETE" }), params({ sessionId: bSession.id }));
    expect(foreign.status).toBe(404);
    signInAs(session, null);
    expect((await me(apiRequest("/api/ext/me", { token: b.token }))).status).toBe(200);

    const second = await createExtensionToken(a.owner.id);
    signInAs(session, a.owner);
    const all = await revokeAll(dashboardRequest("/api/account/extension-sessions", { method: "DELETE" }));
    expect(await all.json()).toEqual({ revoked: 2 });
    signInAs(session, null);
    expect((await me(apiRequest("/api/ext/me", { token: a.token }))).status).toBe(401);
    expect((await me(apiRequest("/api/ext/me", { token: second }))).status).toBe(401);
  });
});
