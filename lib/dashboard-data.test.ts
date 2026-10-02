import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => null }));

import { DELETE as deleteSource } from "@/app/api/drafts/[draftId]/captured-text/route";
import { POST as regenerate } from "@/app/api/drafts/[draftId]/regenerate/route";
import { workspaceAnalytics } from "@/lib/analytics";
import { db } from "@/lib/db";
import { listDrafts, parseDraftFilters } from "@/lib/drafts/data";
import { addMember, apiRequest, createExtensionToken, createProfile, createTenant, params } from "@/lib/test-helpers";

async function seedDraft(
  workspaceId: string,
  brandProfileId: string,
  createdById: string,
  overrides: Partial<{ copyCount: number; channel: "EXTENSION" | "DASHBOARD"; createdAt: Date; editedAt: Date }> = {}
) {
  return db.draft.create({
    data: {
      workspaceId,
      brandProfileId,
      createdById,
      channel: overrides.channel ?? "EXTENSION",
      capturedText: "Which tracker has a free plan?",
      capturedTextChars: 30,
      capturedTextExpiresAt: new Date(Date.now() + 3_600_000),
      options: { tone: "profile", length: "medium", brandMention: "if_relevant" },
      generatedText: "draft",
      currentText: "draft",
      validationIssues: [],
      aiProvider: "mock",
      model: "m",
      promptVersion: "v",
      copyCount: overrides.copyCount ?? 0,
      editedAt: overrides.editedAt ?? null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}

describe("draft source text", () => {
  it("lets the author or an admin delete it now; others can't; outsiders get 404", async () => {
    const { workspace, owner, profile, token } = await createTenant();
    const regular = await addMember(workspace.id, "MEMBER");
    const regularToken = await createExtensionToken(regular.id);
    const outsider = await createTenant();
    const draft = await seedDraft(workspace.id, profile.id, owner.id);
    const request = (bearer: string) =>
      deleteSource(apiRequest(`/api/drafts/${draft.id}/captured-text`, { method: "DELETE", token: bearer }), params({ draftId: draft.id }));

    expect((await request(outsider.token)).status).toBe(404);
    expect((await request(regularToken)).status).toBe(403);
    expect((await request(token)).status).toBe(204);
    const stored = await db.draft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.capturedText).toBeNull();
    expect(stored.capturedTextPurgedAt).not.toBeNull();
    expect(await db.auditEvent.count({ where: { targetId: draft.id, action: "draft.source_deleted" } })).toBe(1);
  });

  it("refuses to regenerate from text past its retention window even before the purge runs", async () => {
    const { workspace, owner, profile, token } = await createTenant();
    const draft = await seedDraft(workspace.id, profile.id, owner.id);
    await db.draft.update({ where: { id: draft.id }, data: { capturedTextExpiresAt: new Date(Date.now() - 1000) } });
    const response = await regenerate(apiRequest(`/api/drafts/${draft.id}/regenerate`, { method: "POST", token, body: {} }), params({ draftId: draft.id }));
    expect(response.status).toBe(409);
  });
});

describe("draft history", () => {
  it("filters by author, profile, rating, and copy status within one workspace, with cursor paging", async () => {
    const { workspace, owner, profile } = await createTenant();
    const second = await createProfile(workspace.id);
    const teammate = await addMember(workspace.id, "MEMBER");
    const other = await createTenant();
    await seedDraft(other.workspace.id, other.profile.id, other.owner.id);

    const mineCopied = await seedDraft(workspace.id, profile.id, owner.id, { copyCount: 2 });
    const mineRatedDown = await seedDraft(workspace.id, second.id, owner.id);
    await db.draftFeedback.create({ data: { workspaceId: workspace.id, draftId: mineRatedDown.id, userId: teammate.id, rating: "DOWN" } });
    const theirs = await seedDraft(workspace.id, profile.id, teammate.id);

    const actor = { userId: owner.id, workspaceId: workspace.id, role: "OWNER" as const };
    const ids = async (query: Record<string, string>) => (await listDrafts(actor, parseDraftFilters(query))).items.map((d) => d.id).sort();

    expect(await ids({})).toEqual([mineCopied.id, mineRatedDown.id, theirs.id].sort());
    expect(await ids({ author: "me" })).toEqual([mineCopied.id, mineRatedDown.id].sort());
    expect(await ids({ profile: second.id })).toEqual([mineRatedDown.id]);
    expect(await ids({ feedback: "down" })).toEqual([mineRatedDown.id]);
    expect(await ids({ feedback: "none" })).toEqual([mineCopied.id, theirs.id].sort());
    expect(await ids({ copied: "yes" })).toEqual([mineCopied.id]);
    expect(await ids({ profile: other.profile.id })).toEqual([]);
    expect(parseDraftFilters({ author: "everyone", feedback: "x" })).toMatchObject({ author: "all", feedback: "all" });
  });

  it("pages with a cursor", async () => {
    const { workspace, owner, profile } = await createTenant();
    for (let i = 0; i < 27; i++) await seedDraft(workspace.id, profile.id, owner.id);
    const actor = { userId: owner.id, workspaceId: workspace.id, role: "OWNER" as const };
    const first = await listDrafts(actor, parseDraftFilters({}));
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    const second = await listDrafts(actor, parseDraftFilters({ cursor: first.nextCursor! }));
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((d) => d.id)).size).toBe(27);
  });
});

describe("analytics", () => {
  it("counts only this workspace's activity in the period and compares with the previous one", async () => {
    const { workspace, owner, profile } = await createTenant();
    const teammate = await addMember(workspace.id, "MEMBER");
    const other = await createTenant();
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

    const a = await seedDraft(workspace.id, profile.id, owner.id, { copyCount: 1, editedAt: now });
    const b = await seedDraft(workspace.id, profile.id, owner.id, { channel: "DASHBOARD" });
    await seedDraft(workspace.id, profile.id, owner.id, { createdAt: daysAgo(10) }); // previous 7-day period
    await seedDraft(other.workspace.id, other.profile.id, other.owner.id, { copyCount: 5 });
    await db.draftFeedback.create({ data: { workspaceId: workspace.id, draftId: a.id, userId: teammate.id, rating: "UP" } });
    await db.draftFeedback.create({
      data: { workspaceId: workspace.id, draftId: b.id, userId: owner.id, rating: "DOWN", reasons: ["too_long", "too_salesy"] },
    });

    const result = await workspaceAnalytics(workspace.id, 7, now);
    expect(result.current).toMatchObject({ generated: 2, copied: 1, edited: 1, extension: 1, ratedUp: 1, ratedDown: 1, activeMembers: 2 });
    expect(result.previous.generated).toBe(1);
    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)).toMatchObject({ generated: 2, copied: 1 });
    expect(result.profiles).toEqual([
      { id: profile.id, name: profile.name, archived: false, generated: 2, copied: 1, up: 1, down: 1 },
    ]);
    expect(result.negativeReasons.map((row) => row.reason).sort()).toEqual(["too_long", "too_salesy"]);
  });
});
