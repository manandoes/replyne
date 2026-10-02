import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listOpportunities, POST as createOpportunity } from "@/app/api/opportunities/route";
import { GET as getOpportunity, PATCH as updateOpportunity, POST as advanceOpportunity } from "@/app/api/opportunities/[opportunityId]/route";
import { db } from "@/lib/db";
import { apiRequest, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("opportunities", () => {
  it("creates and lists opportunities", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    // Create a conversation first.
    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Looking for a free project tracker", title: "Free tracker request" },
      }),
      
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    // Create an opportunity.
    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Free tracker lead", notes: "Interested in our product" },
      }),
      
    );
    expect(created.status).toBe(201);
    const createdData = (await created.json()) as { opportunity: { id: string; title: string; stage: string; notes: string } };
    expect(createdData.opportunity.title).toBe("Free tracker lead");
    expect(createdData.opportunity.stage).toBe("NEW");
    expect(createdData.opportunity.notes).toBe("Interested in our product");

    // List it back.
    const listed = await listOpportunities(dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { opportunities: { id: string; title: string }[] };
    expect(listedBody.opportunities).toHaveLength(1);
    expect((listedBody.opportunities[0] ?? {}).title).toBe("Free tracker lead");
  });

  it("allows advancing an opportunity through the pipeline", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Test conversation" },
      }),
      
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Test opportunity" },
      }),
      
    );
    const oppId = ((await created.json()) as { opportunity: { id: string } }).opportunity.id;

    // Advance to REVIEWING.
    const advanced = await advanceOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}/advance?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { stage: "REVIEWING", note: "Reviewing the request" },
      }),
      params({ opportunityId: oppId })
    );
    expect(advanced.status).toBe(200);
    const advancedData = (await advanced.json()) as { opportunity: { stage: string; notes: string; lastContactAt: string | null } };
    expect(advancedData.opportunity.stage).toBe("REVIEWING");
    expect(advancedData.opportunity.notes).toContain("Reviewing the request");
    expect(advancedData.opportunity.lastContactAt).toBeTruthy();

    // Advance to QUALIFIED (resolved stage).
    const qualified = await advanceOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}/advance?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { stage: "QUALIFIED" },
      }),
      params({ opportunityId: oppId })
    );
    expect(qualified.status).toBe(200);
    const qualifiedData = (await qualified.json()) as { opportunity: { stage: string; resolvedAt: string | null } };
    expect(qualifiedData.opportunity.stage).toBe("QUALIFIED");
    expect(qualifiedData.opportunity.resolvedAt).toBeTruthy();

    // Read the full opportunity.
    const got = await getOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}?workspaceId=${workspace.id}`),
      params({ opportunityId: oppId })
    );
    expect(got.status).toBe(200);
    const gotData = (await got.json()) as { opportunity: { stage: string; resolvedAt: string | null; conversation: { id: string; title: string | null } } };
    expect(gotData.opportunity.stage).toBe("QUALIFIED");
    expect(gotData.opportunity.conversation.id).toBe(convId);
  });

  it("allows updating an opportunity without advancing", async () => {
    const { owner, workspace } = await createTenant();
    signInAs(session, owner);

    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Test conversation" },
      }),
      
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Original title" },
      }),
      
    );
    const oppId = ((await created.json()) as { opportunity: { id: string } }).opportunity.id;

    // Update title and notes.
    const updated = await updateOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}?workspaceId=${workspace.id}`, {
        method: "PATCH",
        body: { title: "Updated title", notes: "New notes" },
      }),
      params({ opportunityId: oppId })
    );
    expect(updated.status).toBe(200);
    const updatedData = (await updated.json()) as { opportunity: { title: string; notes: string; stage: string } };
    expect(updatedData.opportunity.title).toBe("Updated title");
    expect(updatedData.opportunity.notes).toBe("New notes");
    expect(updatedData.opportunity.stage).toBe("NEW"); // stage unchanged
  });

  it("returns 404 for opportunities in other workspaces", async () => {
    const a = await createTenant();
    const b = await createTenant();
    signInAs(session, a.owner);

    const list = await listOpportunities(dashboardRequest(`/api/opportunities?workspaceId=${b.workspace.id}`));
    expect(list.status).toBe(404);
  });
});
