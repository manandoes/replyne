import { describe, expect, it, vi } from "vitest";

// Route handlers fall back to the dashboard session when there's no bearer
// token; outside a Next request there is no session, so pin it to "signed out"
// unless a test sets a user.
const sessionUser = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => sessionUser.current }));

import { POST as decide } from "@/app/api/ext/pair/decide/route";
import { POST as poll } from "@/app/api/ext/pair/poll/route";
import { POST as start } from "@/app/api/ext/pair/start/route";
import { GET as me } from "@/app/api/ext/me/route";
import { DELETE as signOut } from "@/app/api/ext/session/route";
import { db } from "@/lib/db";
import { hashSecret } from "@/lib/extension-auth";
import { apiRequest, createExtensionToken, createTenant, createUser, suffix } from "@/lib/test-helpers";

async function startPairing() {
  const response = await start(
    apiRequest("/api/ext/pair/start", {
      method: "POST",
      body: { clientLabel: "Chrome on Windows" },
      headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}-${suffix()}` },
    })
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { deviceCode: string; userCode: string; verificationUri: string };
}

const pollOnce = async (deviceCode: string) =>
  (await (await poll(apiRequest("/api/ext/pair/poll", { method: "POST", body: { deviceCode } }))).json()) as {
    status: string;
    token?: string;
  };

const decideAs = (userId: string, userCode: string, decision: "approve" | "deny", origin = "http://localhost:3000") => {
  sessionUser.current = { id: userId, email: "x@example.com", name: "X" };
  return decide(
    apiRequest("/api/ext/pair/decide", { method: "POST", body: { userCode, decision }, headers: { origin } })
  );
};

describe("extension pairing", () => {
  it("issues a token exactly once after the signed-in user approves the typed code", async () => {
    const { owner } = await createTenant();
    const pairing = await startPairing();
    expect(pairing.userCode).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(pairing.verificationUri).toBe("http://localhost:3000/extension/connect");

    expect(await pollOnce(pairing.deviceCode)).toEqual({ status: "pending" });

    const approved = await decideAs(owner.id, pairing.userCode.toLowerCase(), "approve");
    expect(approved.status).toBe(200);

    const first = await pollOnce(pairing.deviceCode);
    expect(first.status).toBe("approved");
    expect(first.token).toMatch(/^rl_ext_/);
    // The token is stored only as a hash.
    const stored = await db.extensionSession.findUnique({ where: { tokenHash: hashSecret(first.token!) } });
    expect(stored?.userId).toBe(owner.id);

    expect(await pollOnce(pairing.deviceCode)).toEqual({ status: "expired" });

    const meResponse = await me(apiRequest("/api/ext/me", { token: first.token }));
    expect(meResponse.status).toBe(200);

    const audit = await db.auditEvent.findFirst({ where: { actorUserId: owner.id, action: "extension.pairing_approved" } });
    expect(audit).not.toBeNull();
  });

  it("reports denial and never issues a token", async () => {
    const user = await createUser();
    const pairing = await startPairing();
    expect((await decideAs(user.id, pairing.userCode, "deny")).status).toBe(200);
    expect(await pollOnce(pairing.deviceCode)).toEqual({ status: "denied" });
  });

  it("rejects expired codes and unknown device codes", async () => {
    const user = await createUser();
    const pairing = await startPairing();
    await db.extensionPairing.updateMany({
      where: { deviceCodeHash: hashSecret(pairing.deviceCode) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await decideAs(user.id, pairing.userCode, "approve")).status).toBe(404);
    expect(await pollOnce(pairing.deviceCode)).toEqual({ status: "expired" });
    expect(await pollOnce(`rl_dev_${"x".repeat(40)}`)).toEqual({ status: "expired" });
  });

  it("only lets a same-origin dashboard session approve codes", async () => {
    const user = await createUser();
    const pairing = await startPairing();

    const crossSite = await decideAs(user.id, pairing.userCode, "approve", "https://evil.example.com");
    expect(crossSite.status).toBe(403);

    sessionUser.current = null;
    const token = await createExtensionToken(user.id);
    const viaExtension = await decide(
      apiRequest("/api/ext/pair/decide", { method: "POST", token, body: { userCode: pairing.userCode, decision: "approve" } })
    );
    expect(viaExtension.status).toBe(403);
    expect(await pollOnce(pairing.deviceCode)).toEqual({ status: "pending" });
  });

  it("stops accepting a token after sign-out", async () => {
    const { token } = await createTenant();
    sessionUser.current = null;
    expect((await signOut(apiRequest("/api/ext/session", { method: "DELETE", token }))).status).toBe(204);
    expect((await me(apiRequest("/api/ext/me", { token }))).status).toBe(401);
  });

  it("returns only the caller's own workspaces and profiles", async () => {
    const a = await createTenant();
    const b = await createTenant();
    sessionUser.current = null;
    const body = (await (await me(apiRequest("/api/ext/me", { token: a.token }))).json()) as {
      workspaces: { id: string; brandProfiles: { id: string }[] }[];
      aiProvider: string;
    };
    expect(body.workspaces.map((w) => w.id)).toEqual([a.workspace.id]);
    expect(body.workspaces[0]?.brandProfiles.map((p) => p.id)).toEqual([a.profile.id]);
    expect(JSON.stringify(body)).not.toContain(b.workspace.id);
    expect(body.aiProvider).toBe("mock");
  });

  it("rejects unauthenticated and garbage tokens", async () => {
    sessionUser.current = null;
    expect((await me(apiRequest("/api/ext/me"))).status).toBe(401);
    expect((await me(apiRequest("/api/ext/me", { token: "rl_ext_not-a-real-token" }))).status).toBe(401);
  });
});
