import type { Metadata } from "next";
import { formatDate } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { MembersManager } from "./members-manager";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/members`);
  const canManage = can(actor.role, "members.manage");
  const now = new Date();

  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    canManage
      ? db.invite.findMany({
          where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true, invitedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Members"
        description="Owners manage everyone. Admins manage members and viewers. Every workspace keeps at least one owner."
      />
      <MembersManager
        workspaceId={workspaceId}
        me={actor.userId}
        myRole={actor.role}
        canManage={canManage}
        members={members.map((member) => ({
          userId: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          joined: formatDate(member.createdAt),
        }))}
        invites={invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          invitedBy: invite.invitedBy?.name ?? null,
          expires: formatDate(invite.expiresAt),
        }))}
      />
    </>
  );
}
