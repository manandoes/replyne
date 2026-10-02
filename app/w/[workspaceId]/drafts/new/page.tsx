import type { Metadata } from "next";
import Link from "next/link";
import { buttonClassName, Card } from "@shared/ui";
import { AccessNote, EmptyState, PageHeader } from "@/components/page-header";
import { resolveAiProviderName } from "@/lib/ai/provider";
import { capturedTextRetentionHours } from "@/lib/config";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { DraftComposer } from "./draft-composer";

export const metadata: Metadata = { title: "New draft" };

export default async function NewDraftPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/drafts/new`);
  const provider = resolveAiProviderName();

  const header = (
    <PageHeader
      title="New draft"
      description="Paste a post or comment to draft a reply. With the browser extension you can do this straight from the page you're reading."
    />
  );

  if (!can(actor.role, "draft.generate")) {
    return (
      <>
        {header}
        <AccessNote>Your role in this workspace is read-only, so you can&apos;t generate drafts.</AccessNote>
      </>
    );
  }

  const profiles = await db.brandProfile.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, brandName: true },
  });

  return (
    <>
      {header}
      {profiles.length === 0 ? (
        <EmptyState
          title="Create a brand profile first"
          action={
            can(actor.role, "profile.manage") ? (
              <Link href={`/w/${workspaceId}/profiles/new`} className={buttonClassName("primary")}>
                New brand profile
              </Link>
            ) : undefined
          }
        >
          Drafts are written in a brand profile&apos;s voice, using only its verified facts.
        </EmptyState>
      ) : provider === "unconfigured" ? (
        <AccessNote>Drafting isn&apos;t set up on the server yet. Ask your administrator to configure the AI provider.</AccessNote>
      ) : (
        <Card className="p-5">
          <DraftComposer
            workspaceId={workspaceId}
            profiles={profiles}
            providerLabel={provider === "gemini" ? "Google Gemini" : "a development mock (no AI provider configured)"}
            retentionHours={capturedTextRetentionHours()}
          />
        </Card>
      )}
    </>
  );
}
