import { redirect } from "next/navigation";
import { Card } from "@shared/ui";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { PlainShell } from "@/components/dashboard-shell";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";

/** Sends people to their first workspace, or helps them create one. */
export default async function HomePage() {
  const user = await requirePageUser("/");
  const first = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (first) redirect(`/w/${first.workspaceId}`);

  return (
    <PlainShell backHref={null}>
      <h1 className="text-xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You aren&apos;t in a workspace yet. If a teammate invited you, open the invite link they sent. Otherwise,
        create a workspace to get started.
      </p>
      <Card className="mt-6 p-5">
        <CreateWorkspaceForm />
      </Card>
    </PlainShell>
  );
}
