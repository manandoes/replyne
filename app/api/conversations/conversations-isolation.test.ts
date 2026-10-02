import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listConversations, POST as createConversation } from "@/app/api/conversations/route";
import { DELETE as deleteConversation } from "@/app/api/conversations/[conversationId]/route";
import { db } from "@/lib/db";
import { addMember, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("conversations tenant isolation", () => {
  it("members can create but not delete conversations", async () => {
    const { workspace, owner } = await createTenant();
    const member = await addMember(workspace.id, "MEMBER");
    const admin = await addMember(workspace.id, "ADMIN");

    // Member creates.
    signInAs(session, member);
    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test conversation", title: "Member conversation" },
      })
    );
    expect(created.status).toBe(201);
    const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;

    // Member can't delete.
    const deletedByMember = await deleteConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ conversationId })
    );
    expect(deletedByMember.status).toBe(403);

    // Admin can delete.
    signInAs(session, admin);
    const deletedByAdmin = await deleteConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ conversationId })
    );
    expect(deletedByAdmin.status).toBe(200);
  });

  it("audit log records conversation actions without text content", async () => {
    const { workspace, owner } = await createTenant();
    signInAs(session, owner);

    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Looking for a free project tracker with Slack integration", title: "Free tracker request" },
      })
    );
    expect(created.status).toBe(201);
    const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;

    await deleteConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ conversationId })
    );

    const audits = await db.auditEvent.findMany({
      where: { workspaceId: workspace.id, targetType: "Conversation" },
    });
    expect(audits).toHaveLength(2);

    for (const audit of audits) {
      const metaStr = JSON.stringify(audit.metadata);
      expect(metaStr).not.toContain("project tracker");
      expect(metaStr).not.toContain("Slack integration");
      expect(metaStr).not.toContain("free tracker");
    }
  });

  it("viewers can list conversations but not create them", async () => {
    const { workspace, owner } = await createTenant();
    const viewer = await addMember(workspace.id, "VIEWER");

    // Owner creates.
    signInAs(session, owner);
    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Visible to viewers", title: "Viewer conversation" },
      })
    );
    expect(created.status).toBe(201);

    // Viewer can list.
    signInAs(session, viewer);
    const listed = await listConversations(dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { conversations: { title: string }[] };
    expect(listedBody.conversations).toHaveLength(1);

    // Viewer can't create.
    const byViewer = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Should fail", title: "Viewer creation" },
      })
    );
    expect(byViewer.status).toBe(403);
  });

  it("validates input: empty text is rejected", async () => {
    const { workspace, owner } = await createTenant();
    signInAs(session, owner);

    const empty = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "   " },
      })
    );
    expect(empty.status).toBe(400);
  });

  it("validates input: text over max is rejected", async () => {
    const { workspace, owner } = await createTenant();
    signInAs(session, owner);

    const tooLong = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "x".repeat(8001) },
      })
    );
    expect(tooLong.status).toBe(400);
  });
});
