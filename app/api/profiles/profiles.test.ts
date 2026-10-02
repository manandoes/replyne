import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { POST as generate } from "@/app/api/drafts/route";
import { GET as me } from "@/app/api/ext/me/route";
import { POST as archive } from "@/app/api/profiles/[profileId]/archive/route";
import { PATCH as update } from "@/app/api/profiles/[profileId]/route";
import { POST as create } from "@/app/api/workspaces/[workspaceId]/profiles/route";
import { db } from "@/lib/db";
import { brandProfileInputSchema, normalizeDomain } from "@shared/contracts";
import { addMember, apiRequest, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

const valid = {
  name: "Support voice",
  brandName: "Acme",
  facts: ["Acme has a free plan for up to 3 users.", "  ", ""],
  linkPolicy: "ALLOWED_DOMAINS",
  allowedLinkDomains: ["https://www.Docs.Acme.io/start?x=1", "acme.io", ""],
};

describe("brand profile input", () => {
  it("normalizes domains and drops blank list rows", () => {
    expect(normalizeDomain("https://www.Acme.io/docs?x")).toBe("acme.io");
    expect(normalizeDomain("not a domain")).toBeNull();
    const parsed = brandProfileInputSchema.parse(valid);
    expect(parsed.facts).toEqual(["Acme has a free plan for up to 3 users."]);
    expect(parsed.allowedLinkDomains).toEqual(["docs.acme.io", "acme.io"]);
  });

  it("reports invalid entries by field path", () => {
    const result = brandProfileInputSchema.safeParse({ ...valid, allowedLinkDomains: ["acme.io", "bad domain"] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["allowedLinkDomains", 1]);
    const noDomains = brandProfileInputSchema.safeParse({ ...valid, allowedLinkDomains: [] });
    expect(noDomains.error?.issues[0]?.path).toEqual(["allowedLinkDomains"]);
  });
});

describe("profile routes", () => {
  it("lets admins create and update, not members; other tenants get 404", async () => {
    const { workspace } = await createTenant();
    const admin = await addMember(workspace.id, "ADMIN");
    const regular = await addMember(workspace.id, "MEMBER");
    const other = await createTenant();

    signInAs(session, regular);
    const denied = await create(dashboardRequest(`/api/workspaces/${workspace.id}/profiles`, { method: "POST", body: valid }), params({ workspaceId: workspace.id }));
    expect(denied.status).toBe(403);

    signInAs(session, admin);
    const created = await create(dashboardRequest(`/api/workspaces/${workspace.id}/profiles`, { method: "POST", body: valid }), params({ workspaceId: workspace.id }));
    expect(created.status).toBe(201);
    const { profileId } = (await created.json()) as { profileId: string };
    const stored = await db.brandProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(stored.allowedLinkDomains).toEqual(["docs.acme.io", "acme.io"]);

    const invalid = await update(
      dashboardRequest(`/api/profiles/${profileId}`, { method: "PATCH", body: { ...valid, allowedLinkDomains: ["ok.io", "nope"] } }),
      params({ profileId })
    );
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { fieldErrors: Record<string, string> }).fieldErrors).toHaveProperty("allowedLinkDomains.1");

    signInAs(session, other.owner);
    const crossTenant = await update(dashboardRequest(`/api/profiles/${profileId}`, { method: "PATCH", body: valid }), params({ profileId }));
    expect(crossTenant.status).toBe(404);
  });

  it("archiving hides a profile from the extension and from drafting; restoring brings it back", async () => {
    const { workspace, owner, profile, token } = await createTenant();
    signInAs(session, owner);
    const toggle = (archived: boolean) =>
      archive(dashboardRequest(`/api/profiles/${profile.id}/archive`, { method: "POST", body: { archived } }), params({ profileId: profile.id }));

    expect((await toggle(true)).status).toBe(200);
    signInAs(session, null);
    const listed = (await (await me(apiRequest("/api/ext/me", { token }))).json()) as { workspaces: { brandProfiles: unknown[] }[] };
    expect(listed.workspaces[0]?.brandProfiles).toEqual([]);
    const draft = await generate(
      apiRequest("/api/drafts", { method: "POST", token, body: { workspaceId: workspace.id, brandProfileId: profile.id, capturedText: "hi" } })
    );
    expect(draft.status).toBe(404);

    signInAs(session, owner);
    expect((await toggle(false)).status).toBe(200);
    expect((await db.brandProfile.findUniqueOrThrow({ where: { id: profile.id } })).archivedAt).toBeNull();
  });
});
