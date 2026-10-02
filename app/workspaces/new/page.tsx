import type { Metadata } from "next";
import { Card } from "@shared/ui";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { PlainShell } from "@/components/dashboard-shell";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const user = await requirePageUser("/workspaces/new");
  const first = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });

  return (
    <PlainShell backHref={first ? `/w/${first.workspaceId}` : null}>
      <h1 className="text-xl font-semibold tracking-tight">New workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">You&apos;ll be its owner and can invite others.</p>
      <Card className="mt-6 p-5">
        <CreateWorkspaceForm />
      </Card>
    </PlainShell>
  );
}
