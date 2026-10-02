import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { user, actor, workspace } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}`);
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspace: { select: { id: true, name: true } } },
  });

  return (
    <DashboardShell
      user={user}
      workspaces={memberships.map((membership) => membership.workspace)}
      current={{ id: workspace.id, name: workspace.name, role: actor.role }}
    >
      {children}
    </DashboardShell>
  );
}
