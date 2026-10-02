import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { DELETE as removeMember, PATCH as changeRole } from "@/app/api/workspaces/[workspaceId]/members/[userId]/route";
import { POST as createInvite } from "@/app/api/workspaces/[workspaceId]/invites/route";
import { DELETE as revokeInvite } from "@/app/api/invites/[inviteId]/route";
import { DELETE as deleteWorkspace, PATCH as renameWorkspace } from "@/app/api/workspaces/[workspaceId]/route";
import { POST as createWorkspace } from "@/app/api/workspaces/route";
import { db } from "@/lib/db";
import { hashSecret } from "@/lib/extension-auth";
import { acceptInviteAsUser, findInviteByToken, registerFromInvite } from "@/lib/invites";
import { canChangeRole, canInviteRole, canRemoveMember } from "@/lib/members";
import { verifyPassword } from "@/lib/passwords";
import {
  addMember,
  apiRequest,
  createTenant,
  createUser,
  dashboardRequest,
  params,
  signInAs,
  suffix,
} from "@/lib/test-helpers";

const ws = (workspaceId: string) => params({ workspaceId });
const member = (workspaceId: string, userId: string) => params({ workspaceId, userId });

describe("role rules", () => {
  it("lets owners manage everyone and admins only members and viewers", () => {
    expect(canChangeRole("OWNER", "ADMIN", "MEMBER")).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "VIEWER")).toBe(true);
    expect(canChangeRole("ADMIN", "MEMBER", "ADMIN")).toBe(false);
    expect(canChangeRole("ADMIN", "OWNER", "MEMBER")).toBe(false);
    expect(canChangeRole("MEMBER", "VIEWER", "MEMBER")).toBe(false);
    expect(canRemoveMember("ADMIN", "ADMIN")).toBe(false);
    expect(canRemoveMember("ADMIN", "VIEWER")).toBe(true);
    expect(canInviteRole("ADMIN", "ADMIN")).toBe(false);
    expect(canInviteRole("OWNER", "ADMIN")).toBe(true);
    expect(canInviteRole("OWNER", "OWNER")).toBe(false);
  });
});

describe("workspaces", () => {
  it("creates a workspace with the creator as owner", async () => {
    const user = await createUser();
    signInAs(session, user);
    const response = await createWorkspace(dashboardRequest("/api/workspaces", { method: "POST", body: { name: "Client A" } }));
    expect(response.status).toBe(201);
    const { workspace } = (await response.json()) as { workspace: { id: string } };
    const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } } });
    expect(membership?.role).toBe("OWNER");
  });

  it("refuses extension tokens and cross-site requests on dashboard routes", async () => {
    const { workspace, token, owner } = await createTenant();
    signInAs(session, null);
    const viaToken = await renameWorkspace(apiRequest(`/api/workspaces/${workspace.id}`, { method: "PATCH", token, body: { name: "x" } }), ws(workspace.id));
    expect(viaToken.status).toBe(403);

    signInAs(session, owner);
    const crossSite = await renameWorkspace(
      dashboardRequest(`/api/workspaces/${workspace.id}`, { method: "PATCH", body: { name: "x" }, origin: "https://evil.example.com" }),
      ws(workspace.id)
    );
    expect(crossSite.status).toBe(403);
  });

  it("lets admins rename, not members; outsiders get 404", async () => {
    const { workspace } = await createTenant();
    const admin = await addMember(workspace.id, "ADMIN");
    const regular = await addMember(workspace.id, "MEMBER");
    const outsider = await createUser();
    const rename = (name: string) =>
      renameWorkspace(dashboardRequest(`/api/workspaces/${workspace.id}`, { method: "PATCH", body: { name } }), ws(workspace.id));

    signInAs(session, regular);
    expect((await rename("Nope")).status).toBe(403);
    signInAs(session, outsider);
    expect((await rename("Nope")).status).toBe(404);
    signInAs(session, admin);
    expect((await rename("Renamed")).status).toBe(200);
    expect((await db.workspace.findUnique({ where: { id: workspace.id } }))?.name).toBe("Renamed");
  });

  it("deletes everything only for an owner who types the name, keeping one platform audit record", async () => {
    const tenant = await createTenant();
    const { workspace, owner, profile } = tenant;
    const admin = await addMember(workspace.id, "ADMIN");
    await db.draft.create({
      data: {
        workspaceId: workspace.id,
        brandProfileId: profile.id,
        createdById: owner.id,
        channel: "EXTENSION",
        capturedText: "reddit text",
        capturedTextChars: 11,
        capturedTextExpiresAt: new Date(Date.now() + 3_600_000),
        options: {},
        generatedText: "draft",
        currentText: "draft",
        validationIssues: [],
        aiProvider: "mock",
        model: "m",
        promptVersion: "v",
      },
    });
    const name = (await db.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name;
    const remove = (confirmName: string) =>
      deleteWorkspace(dashboardRequest(`/api/workspaces/${workspace.id}`, { method: "DELETE", body: { confirmName } }), ws(workspace.id));

    signInAs(session, admin);
    expect((await remove(name)).status).toBe(403);
    signInAs(session, owner);
    expect((await remove("wrong name")).status).toBe(400);
    expect((await remove(name)).status).toBe(204);

    expect(await db.workspace.findUnique({ where: { id: workspace.id } })).toBeNull();
    expect(await db.draft.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await db.brandProfile.count({ where: { workspaceId: workspace.id } })).toBe(0);
    const record = await db.auditEvent.findFirst({ where: { action: "workspace.deleted", targetId: workspace.id } });
    expect(record?.workspaceId).toBeNull();
  });
});

describe("members", () => {
  it("stops admins from escalating and protects the last owner", async () => {
    const { workspace, owner } = await createTenant();
    const admin = await addMember(workspace.id, "ADMIN");
    const regular = await addMember(workspace.id, "MEMBER");
    const setRole = (userId: string, role: string) =>
      changeRole(dashboardRequest(`/api/workspaces/${workspace.id}/members/${userId}`, { method: "PATCH", body: { role } }), member(workspace.id, userId));

    signInAs(session, admin);
    expect((await setRole(regular.id, "ADMIN")).status).toBe(403);
    expect((await setRole(regular.id, "VIEWER")).status).toBe(200);
    expect((await setRole(owner.id, "MEMBER")).status).toBe(403);

    signInAs(session, owner);
    expect((await setRole(owner.id, "ADMIN")).status).toBe(409); // the only owner
    expect((await setRole(admin.id, "OWNER")).status).toBe(200);
    expect((await setRole(owner.id, "ADMIN")).status).toBe(200); // now someone else owns it

    const audit = await db.auditEvent.findMany({ where: { workspaceId: workspace.id, action: "member.role_changed" } });
    expect(audit.length).toBe(3);
  });

  it("lets anyone leave except the sole owner, and admins remove only members and viewers", async () => {
    const { workspace, owner } = await createTenant();
    const admin = await addMember(workspace.id, "ADMIN");
    const viewer = await addMember(workspace.id, "VIEWER");
    const leave = (userId: string) =>
      removeMember(dashboardRequest(`/api/workspaces/${workspace.id}/members/${userId}`, { method: "DELETE" }), member(workspace.id, userId));

    signInAs(session, owner);
    expect((await leave(owner.id)).status).toBe(409);
    signInAs(session, admin);
    expect((await leave(owner.id)).status).toBe(403);
    signInAs(session, viewer);
    expect((await leave(viewer.id)).status).toBe(204);
    signInAs(session, admin);
    expect((await leave(admin.id)).status).toBe(204);
    expect(await db.membership.count({ where: { workspaceId: workspace.id } })).toBe(1);
  });
});

describe("invites", () => {
  async function invite(workspaceId: string, email: string, role = "MEMBER") {
    const response = await createInvite(
      dashboardRequest(`/api/workspaces/${workspaceId}/invites`, { method: "POST", body: { email, role } }),
      ws(workspaceId)
    );
    return { status: response.status, body: (await response.json()) as { inviteUrl?: string; inviteId?: string; fieldErrors?: Record<string, string> } };
  }
  const tokenOf = (url: string) => url.split("/invite/")[1]!;

  it("shows the link once, stores only a hash, and lets the invited account join", async () => {
    const { workspace, owner } = await createTenant();
    const invitee = await createUser("Invitee");
    signInAs(session, owner);
    const { status, body } = await invite(workspace.id, invitee.email.toUpperCase());
    expect(status).toBe(201);
    const token = tokenOf(body.inviteUrl!);
    expect(token).toMatch(/^rl_inv_/);
    const stored = await db.invite.findUniqueOrThrow({ where: { id: body.inviteId! } });
    expect(stored.tokenHash).toBe(hashSecret(token));
    expect(stored.email).toBe(invitee.email);

    const stranger = await createUser();
    expect(await acceptInviteAsUser(token, stranger)).toMatchObject({ ok: false, code: "email_mismatch" });
    expect(await acceptInviteAsUser(token, invitee)).toEqual({ ok: true, workspaceId: workspace.id });
    expect(await acceptInviteAsUser(token, invitee)).toMatchObject({ ok: false, code: "invite_unavailable" });
    const joined = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: invitee.id } } });
    expect(joined?.role).toBe("MEMBER");
  });

  it("creates an account from an invite with a hashed password", async () => {
    const { workspace, owner } = await createTenant();
    const email = `new-${suffix()}@example.com`;
    signInAs(session, owner);
    const token = tokenOf((await invite(workspace.id, email, "VIEWER")).body.inviteUrl!);
    expect((await findInviteByToken(token)).status).toBe("valid");

    const result = await registerFromInvite(token, { name: "New Person", password: "correct horse battery" });
    expect(result).toEqual({ ok: true, workspaceId: workspace.id, email });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", user.passwordHash!)).toBe(true);
    expect((await findInviteByToken(token)).status).toBe("accepted");
  });

  it("refuses admin invites from admins, duplicates of members, and revoked or expired links", async () => {
    const { workspace, owner } = await createTenant();
    const admin = await addMember(workspace.id, "ADMIN");
    signInAs(session, admin);
    expect((await invite(workspace.id, `a-${suffix()}@example.com`, "ADMIN")).status).toBe(403);
    expect((await invite(workspace.id, owner.email)).status).toBe(409);

    const email = `r-${suffix()}@example.com`;
    const created = await invite(workspace.id, email);
    const revoke = await revokeInvite(dashboardRequest(`/api/invites/${created.body.inviteId}`, { method: "DELETE" }), params({ inviteId: created.body.inviteId! }));
    expect(revoke.status).toBe(204);
    expect((await findInviteByToken(tokenOf(created.body.inviteUrl!))).status).toBe("revoked");

    const second = await invite(workspace.id, `e-${suffix()}@example.com`);
    await db.invite.update({ where: { id: second.body.inviteId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const token = tokenOf(second.body.inviteUrl!);
    expect((await findInviteByToken(token)).status).toBe("expired");
    expect(await registerFromInvite(token, { name: "Late", password: "long enough password" })).toMatchObject({ ok: false, code: "invite_unavailable" });
  });

  it("keeps invites inside their workspace", async () => {
    const a = await createTenant();
    const b = await createTenant();
    signInAs(session, a.owner);
    const created = await invite(a.workspace.id, `x-${suffix()}@example.com`);
    signInAs(session, b.owner);
    const revoke = await revokeInvite(dashboardRequest(`/api/invites/${created.body.inviteId}`, { method: "DELETE" }), params({ inviteId: created.body.inviteId! }));
    expect(revoke.status).toBe(404);
    expect((await db.invite.findUniqueOrThrow({ where: { id: created.body.inviteId! } })).revokedAt).toBeNull();
  });
});
