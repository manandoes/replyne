import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listWatchLists, POST as createWatchList } from "@/app/api/watchlists/route";
import { PATCH as updateWatchList, DELETE as deleteWatchList } from "@/app/api/watchlists/[watchListId]/route";
import { db } from "@/lib/db";
import { addMember, apiRequest, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("watchlists tenant isolation", () => {
  it("members cannot create or delete watchlists", async () => {
    const { workspace, owner } = await createTenant();
    const member = await addMember(workspace.id, "MEMBER");
    const admin = await addMember(workspace.id, "ADMIN");

    signInAs(session, member);
    const createdByMember = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Member watchlist", type: "KEYWORD", terms: ["x"] },
      })
    );
    expect(createdByMember.status).toBe(403);
    signInAs(session, admin);

    const createdByAdmin = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Admin watchlist", type: "KEYWORD", terms: ["x"] },
      })
    );
    expect(createdByAdmin.status).toBe(201);
    const watchListId = ((await createdByAdmin.json()) as { watchList: { id: string } }).watchList.id;

    // Member still can't delete.
    signInAs(session, member);
    const deletedByMember = await deleteWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ watchListId })
    );
    expect(deletedByMember.status).toBe(403);

    // Admin can delete.
    signInAs(session, admin);
    const deletedByAdmin = await deleteWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ watchListId })
    );
    expect(deletedByAdmin.status).toBe(200);
  });

  it("audit log records watchlist actions without terms content", async () => {
    const { workspace, owner } = await createTenant();
    signInAs(session, owner);

    const created = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Project tracker keywords", type: "KEYWORD", terms: ["free plan", "open source"] },
      })
    );
    expect(created.status).toBe(201);
    const watchListId = ((await created.json()) as { watchList: { id: string } }).watchList.id;

    // Update it.
    await updateWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, {
        method: "PATCH",
        body: { name: "Updated keywords" },
      }),
      params({ watchListId })
    );

    // Delete it.
    await deleteWatchList(
      dashboardRequest(`/api/watchlists/${watchListId}?workspaceId=${workspace.id}`, { method: "DELETE" }),
      params({ watchListId })
    );

    const audits = await db.auditEvent.findMany({
      where: { workspaceId: workspace.id, targetType: "WatchList" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(3);
    expect((audits[0] ?? {}).action).toBe("watchlist.created");
    expect((audits[1] ?? {}).action).toBe("watchlist.updated");
    expect((audits[2] ?? {}).action).toBe("watchlist.deleted");

    // No raw terms in audit metadata.
    for (const audit of audits) {
      const metaStr = JSON.stringify(audit.metadata);
      expect(metaStr).not.toContain("free plan");
      expect(metaStr).not.toContain("open source");
    }
  });

  it("viewers can list but not create", async () => {
    const { workspace, owner } = await createTenant();
    const viewer = await addMember(workspace.id, "VIEWER");

    // Owner creates one.
    signInAs(session, owner);
    const created = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Viewer sees this", type: "KEYWORD", terms: ["x"] },
      })
    );
    expect(created.status).toBe(201);

    // Viewer can list.
    signInAs(session, viewer);
    const listed = await listWatchLists(dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { watchLists: { name: string }[] };
    expect(listedBody.watchLists).toHaveLength(1);

    // Viewer can't create.
    const byViewer = await createWatchList(
      dashboardRequest(`/api/watchlists?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { name: "Should fail", type: "KEYWORD", terms: ["x"] },
      })
    );
    expect(byViewer.status).toBe(403);
  });
});
