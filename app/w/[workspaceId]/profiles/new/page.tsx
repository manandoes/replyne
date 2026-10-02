import type { Metadata } from "next";
import Link from "next/link";
import { AccessNote, PageHeader } from "@/components/page-header";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { EMPTY_PROFILE, ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "New brand profile" };

export default async function NewProfilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/profiles/new`);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href={`/w/${workspaceId}/profiles`} className="hover:text-foreground">
          Brand profiles
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">New</span>
      </nav>
      <PageHeader title="New brand profile" />
      {can(actor.role, "profile.manage") ? (
        <ProfileForm workspaceId={workspaceId} profileId={null} initial={EMPTY_PROFILE} canManage archived={false} />
      ) : (
        <AccessNote>Only workspace owners and admins can create brand profiles.</AccessNote>
      )}
    </>
  );
}
