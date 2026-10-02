import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listWatchLists, POST as createWatchList } from "@/app/api/watchlists/route";
import { GET as getWatchList, PATCH as updateWatchList, DELETE as deleteWatchList } from "@/app/api/watchlists/[watchListId]/route";
import { db } from "@/lib/db";
import { apiRequest, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("watchlists", () => {
  it("lists watchlists in the workspace", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    // No watchlists yet.
    const empty = await listWatchLists(dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`));
    expect(empty.status).toBe(200);
    const body = (await empty.json()) as { watchLists: { id: string }[] };
    expect(body.watchLists).toEqual([]);

    // Create one.
    const created = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Acme mentions", type: "COMPETITOR", terms: ["Acme"], subreddit: "sustainability" },
      }),
      
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { watchList: { id: string; name: string; type: string; terms: string[]; subreddit: string | null; conversationCount: number } };
    expect(createdBody.watchList.name).toBe("Acme mentions");
    expect(createdBody.watchList.type).toBe("COMPETITOR");
    expect(createdBody.watchList.terms).toEqual(["acme"]);
    expect(createdBody.watchList.subreddit).toBe("sustainability");
    expect(createdBody.watchList.conversationCount).toBe(0);

    // List now shows it.
    const listed = await listWatchLists(dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { watchLists: { id: string; name: string }[] };
    expect(listedBody.watchLists).toHaveLength(1);
    expect((listedBody.watchLists[0] ?? {}).name).toBe("Acme mentions");
  });

  it("validates watchlist creation input", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    // Empty name should fail.
    const bad = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "", type: "KEYWORD", terms: [] },
      }),
      
    );
    expect(bad.status).toBe(400);
  });

  it("allows admin to update and delete a watchlist", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const created = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Test watchlist", type: "KEYWORD", terms: ["replyline"] },
      }),
      
    );
    const createdData = (await created.json()) as { watchList: { id: string } };
    const watchListId = createdData.watchList.id;

    // Update it.
    const updated = await updateWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, {
        method: "PATCH",
        body: { name: "Updated name", terms: ["updated"], active: false },
      }),
      params({ watchListId })
    );
    expect(updated.status).toBe(200);
    const updatedData = (await updated.json()) as { watchList: { name: string; active: boolean; terms: string[] } };
    expect(updatedData.watchList.name).toBe("Updated name");
    expect(updatedData.watchList.active).toBe(false);
    expect(updatedData.watchList.terms).toEqual(["updated"]);

    // Delete it.
    const deleted = await deleteWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, {
        method: "DELETE",
      }),
      params({ watchListId })
    );
    expect(deleted.status).toBe(200);
    const deletedBody = (await deleted.json()) as { deleted: boolean };
    expect(deletedBody.deleted).toBe(true);

    // Reading it after deletion returns 404.
    const getAfterDelete = await getWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`),
      params({ watchListId })
    );
    expect(getAfterDelete.status).toBe(404);
  });

  it("returns 404 for watchlists in other workspaces", async () => {
    const a = await createTenant();
    const b = await createTenant();
    signInAs(session, a.owner);

    const list = await listWatchLists(dashboardRequest(`/api/watchlists?workspaceId=${b.workspace.id}`));
    expect(list.status).toBe(404);
  });
});
