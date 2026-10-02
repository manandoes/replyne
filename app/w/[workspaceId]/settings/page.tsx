import type { Metadata } from "next";
import { APP_NAME } from "@shared/brand";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@shared/contracts";
import { Card } from "@shared/ui";
import { PageHeader } from "@/components/page-header";
import { capturedTextRetentionHours } from "@/lib/config";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { LIMITS } from "@/lib/rate-limit";
import { WorkspaceSettings } from "./workspace-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor, workspace } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/settings`);
  const owners = await db.membership.count({ where: { workspaceId, role: "OWNER" } });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card className="p-5 text-sm">
          <h2 className="font-semibold">Your role</h2>
          <p className="mt-1">
            {ROLE_LABELS[actor.role]} — <span className="text-muted-foreground">{ROLE_DESCRIPTIONS[actor.role]}</span>
          </p>
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="font-semibold">Data and limits</h2>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>Reddit text captured for drafts is deleted after {capturedTextRetentionHours()} hours. Drafts, links, and ratings remain.</li>
            <li>Up to {LIMITS.draftPerWorkspacePerDay.limit} drafts per day in this workspace, and {LIMITS.draftPerUserPerMinute.limit} per person per minute.</li>
            <li>{APP_NAME} never posts to Reddit. Members review drafts and post replies themselves.</li>
          </ul>
        </Card>
        <WorkspaceSettings
          workspaceId={workspaceId}
          name={workspace.name}
          userId={actor.userId}
          canRename={can(actor.role, "workspace.manage")}
          canDelete={can(actor.role, "workspace.delete")}
          soleOwner={actor.role === "OWNER" && owners <= 1}
        />
      </div>
    </>
  );
}
