import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => null }));

import { POST as copy } from "@/app/api/drafts/[draftId]/copy/route";
import { PUT as feedback } from "@/app/api/drafts/[draftId]/feedback/route";
import { POST as regenerate } from "@/app/api/drafts/[draftId]/regenerate/route";
import { DELETE as remove, GET as getDraft, PATCH as patch } from "@/app/api/drafts/[draftId]/route";
import { POST as generate } from "@/app/api/drafts/route";
import { POST as purge } from "@/app/api/jobs/purge-expired/route";
import { db } from "@/lib/db";
import type { DraftDto } from "@shared/contracts";
import {
  addMember,
  apiRequest,
  createExtensionToken,
  createTenant,
  params,
} from "@/lib/test-helpers";

const CAPTURED = "Does anyone know a project tracker with a free tier for a 3-person team?";

async function generateFor(tenant: Awaited<ReturnType<typeof createTenant>>, extra: Record<string, unknown> = {}) {
  return generate(
    apiRequest("/api/drafts", {
      method: "POST",
      token: tenant.token,
      body: {
        workspaceId: tenant.workspace.id,
        brandProfileId: tenant.profile.id,
        capturedText: CAPTURED,
        sourceUrl: "https://www.reddit.com/r/projectmanagement/comments/abc/free_tracker/?utm_source=share",
        ...extra,
      },
    })
  );
}

async function draftOf(response: Response): Promise<DraftDto> {
  return ((await response.json()) as { draft: DraftDto }).draft;
}

describe("POST /api/drafts", () => {
  it("creates a labeled, validated draft and audits it without content", async () => {
    const tenant = await createTenant();
    const response = await generateFor(tenant);
    expect(response.status).toBe(201);
    const draft = await draftOf(response);

    expect(draft.aiProvider).toBe("mock");
    expect(draft.text).toContain("free plan for up to 3 users");
    expect(draft.sourceUrl).toBe("https://www.reddit.com/r/projectmanagement/comments/abc/free_tracker/");
    expect(draft.sourceSubreddit).toBe("projectmanagement");
    expect(draft.capturedTextAvailable).toBe(true);

    const audit = await db.auditEvent.findFirst({ where: { targetId: draft.id, action: "draft.generated" } });
    expect(audit?.workspaceId).toBe(tenant.workspace.id);
    expect(JSON.stringify(audit?.metadata)).not.toContain("tracker");
  });

  it("returns 404 for another tenant's workspace or brand profile", async () => {
    const a = await createTenant();
    const b = await createTenant();
    expect((await generateFor(a, { workspaceId: b.workspace.id, brandProfileId: b.profile.id })).status).toBe(404);
    expect((await generateFor(a, { brandProfileId: b.profile.id })).status).toBe(404);
  });

  it("forbids viewers from drafting", async () => {
    const tenant = await createTenant();
    const viewer = await addMember(tenant.workspace.id, "VIEWER");
    const token = await createExtensionToken(viewer.id);
    expect((await generateFor({ ...tenant, token })).status).toBe(403);
  });

  it("validates input", async () => {
    const tenant = await createTenant();
    const empty = await generateFor(tenant, { capturedText: "   " });
    expect(empty.status).toBe(400);
    expect((await empty.json()) as { code: string }).toMatchObject({ code: "validation_error" });
    expect((await generateFor(tenant, { sourceUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await generateFor(tenant, { capturedText: "x".repeat(8001) })).status).toBe(400);
  });

  it("rate limits bursts per user", async () => {
    const tenant = await createTenant();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await generateFor(tenant)).status);
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("draft follow-up routes", () => {
  it("lets the author edit (re-validating on the server), copy, rate, and regenerate", async () => {
    const tenant = await createTenant();
    const draft = await draftOf(await generateFor(tenant));
    const ctx = params({ draftId: draft.id });

    const edited = await draftOf(
      await patch(
        apiRequest(`/api/drafts/${draft.id}`, {
          method: "PATCH",
          token: tenant.token,
          body: { text: "Try https://evil.example.com — it's undetectable." },
        }),
        ctx
      )
    );
    expect(edited.editedAt).not.toBeNull();
    expect(edited.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["link_not_allowed", "evasion_claim"])
    );

    const copied = await copy(apiRequest(`/api/drafts/${draft.id}/copy`, { method: "POST", token: tenant.token }), ctx);
    expect(await copied.json()).toEqual({ copyCount: 1 });

    const rated = await feedback(
      apiRequest(`/api/drafts/${draft.id}/feedback`, {
        method: "PUT",
        token: tenant.token,
        body: { rating: "down", reasons: ["too_long", "too_long"], note: "shorter please" },
      }),
      ctx
    );
    expect(await rated.json()).toEqual({ feedback: { rating: "down", reasons: ["too_long"], note: "shorter please" } });

    const next = await regenerate(
      apiRequest(`/api/drafts/${draft.id}/regenerate`, {
        method: "POST",
        token: tenant.token,
        body: { instruction: "Make it shorter" },
      }),
      ctx
    );
    expect(next.status).toBe(201);
    expect((await draftOf(next)).regeneratedFromId).toBe(draft.id);
  });

  it("hides other tenants' drafts behind 404 on every route", async () => {
    const a = await createTenant();
    const b = await createTenant();
    const draft = await draftOf(await generateFor(a));
    const ctx = params({ draftId: draft.id });
    const as = (method: string, body?: unknown) =>
      apiRequest(`/api/drafts/${draft.id}`, { method, token: b.token, body });

    expect((await getDraft(as("GET"), ctx)).status).toBe(404);
    expect((await patch(as("PATCH", { text: "x" }), ctx)).status).toBe(404);
    expect((await remove(as("DELETE"), ctx)).status).toBe(404);
    expect((await copy(as("POST"), ctx)).status).toBe(404);
    expect((await feedback(as("PUT", { rating: "up" }), ctx)).status).toBe(404);
    expect((await regenerate(as("POST", {}), ctx)).status).toBe(404);
    expect((await db.draft.findUnique({ where: { id: draft.id } }))?.currentText).toBe(draft.text);
  });

  it("only lets the author edit, and the author or an admin delete", async () => {
    const tenant = await createTenant();
    const draft = await draftOf(await generateFor(tenant));
    const ctx = params({ draftId: draft.id });
    const member = await addMember(tenant.workspace.id, "MEMBER");
    const memberToken = await createExtensionToken(member.id);
    const admin = await addMember(tenant.workspace.id, "ADMIN");
    const adminToken = await createExtensionToken(admin.id);

    const memberEdit = await patch(
      apiRequest(`/api/drafts/${draft.id}`, { method: "PATCH", token: memberToken, body: { text: "x" } }),
      ctx
    );
    expect(memberEdit.status).toBe(403);
    expect((await remove(apiRequest(`/api/drafts/${draft.id}`, { method: "DELETE", token: memberToken }), ctx)).status).toBe(403);
    expect((await remove(apiRequest(`/api/drafts/${draft.id}`, { method: "DELETE", token: adminToken }), ctx)).status).toBe(204);
    expect(await db.draft.findUnique({ where: { id: draft.id } })).toBeNull();
  });
});

describe("retention", () => {
  it("purges captured Reddit text after its window but keeps the draft", async () => {
    const tenant = await createTenant();
    const draft = await draftOf(await generateFor(tenant));
    await db.draft.update({ where: { id: draft.id }, data: { capturedTextExpiresAt: new Date(Date.now() - 1000) } });

    expect((await purge(apiRequest("/api/jobs/purge-expired", { method: "POST" }))).status).toBe(401);
    const response = await purge(
      apiRequest("/api/jobs/purge-expired", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    expect(response.status).toBe(200);

    const stored = await db.draft.findUnique({ where: { id: draft.id } });
    expect(stored?.capturedText).toBeNull();
    expect(stored?.capturedTextPurgedAt).not.toBeNull();
    expect(stored?.currentText).toBe(draft.text);

    const redraft = await regenerate(
      apiRequest(`/api/drafts/${draft.id}/regenerate`, { method: "POST", token: tenant.token, body: {} }),
      params({ draftId: draft.id })
    );
    expect(redraft.status).toBe(409);
  });
});
