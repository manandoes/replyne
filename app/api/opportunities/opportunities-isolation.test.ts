import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string } }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));

import { GET as listOpportunities, POST as createOpportunity } from "@/app/api/opportunities/route";
import { POST as advanceOpportunity } from "@/app/api/opportunities/[opportunityId]/route";
import { db } from "@/lib/db";
import { addMember, createTenant, dashboardRequest, params, signInAs } from "@/lib/test-helpers";

describe("opportunities tenant isolation", () => {
  it("members can create and advance opportunities", async () => {
    const { workspace, owner } = await createTenant();
    const member = await addMember(workspace.id, "MEMBER");

    // Create a conversation.
    signInAs(session, owner);
    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Test conversation" },
      })
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    // Member creates opportunity.
    signInAs(session, member);
    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Member opportunity" },
      })
    );
    expect(created.status).toBe(201);
    const oppId = ((await created.json()) as { opportunity: { id: string } }).opportunity.id;

    // Member advances it.
    const advanced = await advanceOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}/advance?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { stage: "REVIEWING", note: "Reviewing" },
      }),
      params({ opportunityId: oppId })
    );
    expect(advanced.status).toBe(200);
    const advancedData = (await advanced.json()) as { opportunity: { stage: string } };
    expect(advancedData.opportunity.stage).toBe("REVIEWING");

    // Advance to resolved stage sets resolvedAt.
    const qualified = await advanceOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}/advance?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { stage: "QUALIFIED" },
      }),
      params({ opportunityId: oppId })
    );
    expect(qualified.status).toBe(200);
    const qualifiedData = (await qualified.json()) as { opportunity: { resolvedAt: string | null } };
    expect(qualifiedData.opportunity.resolvedAt).toBeTruthy();
  });

  it("audit log records opportunity actions without sensitive content", async () => {
    const { workspace, owner } = await createTenant();
    signInAs(session, owner);

    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Test conversation" },
      })
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Sensitive opportunity" },
      })
    );
    expect(created.status).toBe(201);
    const oppId = ((await created.json()) as { opportunity: { id: string } }).opportunity.id;

    await advanceOpportunity(
      dashboardRequest(`/api/opportunities/${oppId}/advance?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { stage: "QUALIFIED" },
      }),
      params({ opportunityId: oppId })
    );

    const audits = await db.auditEvent.findMany({
      where: { workspaceId: workspace.id, targetType: "Opportunity" },
    });
    expect(audits).toHaveLength(2);

    for (const audit of audits) {
      const metaStr = JSON.stringify(audit.metadata);
      // Metadata should not contain the opportunity title or notes.
      expect(metaStr).not.toContain("Sensitive opportunity");
    }
  });

  it("viewers can list but not create opportunities", async () => {
    const { workspace, owner } = await createTenant();
    const viewer = await addMember(workspace.id, "VIEWER");

    // Owner creates conversation and opportunity.
    signInAs(session, owner);
    const convRes = await (await import("@/app/api/conversations/route")).POST(
      dashboardRequest(`/api/conversations?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { sourceType: "MANUAL", text: "Test", title: "Test conversation" },
      })
    );
    const convId = ((await convRes.json()) as { conversation: { id: string } }).conversation.id;

    const created = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Viewer sees this" },
      })
    );
    expect(created.status).toBe(201);

    // Viewer can list.
    signInAs(session, viewer);
    const listed = await listOpportunities(dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { opportunities: { title: string }[] };
    expect(listedBody.opportunities).toHaveLength(1);

    // Viewer can't create.
    const byViewer = await createOpportunity(
      dashboardRequest(`/api/opportunities?workspaceId=${workspace.id}`, {
        method: "POST",
        body: { conversationId: convId, title: "Should fail" },
      })
    );
    expect(byViewer.status).toBe(403);
  });
});
