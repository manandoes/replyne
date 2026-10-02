import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listConversations, POST as createConversation } from "@/app/api/conversations/route";
import { GET as getConversation, PATCH as updateConversation, DELETE as deleteConversation } from "@/app/api/conversations/[conversationId]/route";
import { db } from "@/lib/db";
import { apiRequest, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("conversations", () => {
  it("creates and lists conversations", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    // Create a manual conversation.
    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: {
          sourceType: "MANUAL",
          text: "Any project tracker with a free tier for a 3-person team?",
          title: "Project tracker free tier",
          author: "reddit_user_42",
        },
      }),
      
    );
    expect(created.status).toBe(201);
    const createdData = (await created.json()) as { conversation: { id: string; title: string; sourceType: string; author: string; textAvailable: boolean } };
    expect(createdData.conversation.title).toBe("Project tracker free tier");
    expect(createdData.conversation.author).toBe("reddit_user_42");
    expect(createdData.conversation.textAvailable).toBe(true);

    // List it back.
    const listed = await listConversations(dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { conversations: { id: string; title: string }[] };
    expect(listedBody.conversations).toHaveLength(1);
    expect((listedBody.conversations[0] ?? {}).title).toBe("Project tracker free tier");
  });

  it("extracts subreddit from URL", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: {
          sourceType: "MANUAL",
          sourceUrl: "https://www.reddit.com/r/sustainability/comments/abc123/free_tracker/",
          text: "Test conversation",
        },
      }),
      
    );
    expect(created.status).toBe(201);
    const createdData = (await created.json()) as { conversation: { sourceSubreddit: string | null } };
    expect(createdData.conversation.sourceSubreddit).toBe("sustainability");
  });

  it("allows updating a conversation", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Original title" },
      }),
      
    );
    const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;

    const updated = await updateConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`, {
        method: "PATCH",
        body: { title: "Updated title", summary: "AI summary of the thread" },
      }),
      params({ conversationId })
    );
    expect(updated.status).toBe(200);
    const updatedData = (await updated.json()) as { conversation: { title: string; summary: string | null } };
    expect(updatedData.conversation.title).toBe("Updated title");
    expect(updatedData.conversation.summary).toBe("AI summary of the thread");
  });

  it("allows deleting a conversation (admin only)", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const created = await createConversation(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test conversation for deletion" },
      }),
      
    );
    const conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;

    const deleted = await deleteConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`, {
        method: "DELETE",
      }),
      params({ conversationId })
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as { deleted: boolean };
    expect(deletedBody.deleted).toBe(true);

    // Reading it after deletion returns 404.
    const getAfterDelete = await getConversation(
      dashboardRequest(`/api/conversations/${conversationId}?workspaceId=${workspace.id}`),
      params({ conversationId })
    );
    expect(getAfterDelete.status).toBe(404);
  });

  it("returns 404 for conversations in other workspaces", async () => {
    const a = await createTenant();
    const b = await createTenant();
    signInAs(session, a.owner);

    const list = await listConversations(dashboardRequest(`/api/conversations?workspaceId=${b.workspace.id}`));
    expect(list.status).toBe(404);
  });
});
