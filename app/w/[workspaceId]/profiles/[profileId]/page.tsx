import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@shared/ui";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { scopedWhere } from "@/lib/tenant";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "Brand profile" };

export default async function ProfilePage({ params }: { params: Promise<{ workspaceId: string; profileId: string }> }) {
  const { workspaceId, profileId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/profiles/${profileId}`);
  const profile = await db.brandProfile.findFirst({ where: scopedWhere(actor, { id: profileId }) });
  if (!profile) notFound();
  const canManage = can(actor.role, "profile.manage");

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href={`/w/${workspaceId}/profiles`} className="hover:text-foreground">
          Brand profiles
        </Link>
        <span aria-hidden> / </span>
        <span className="text-foreground">{profile.name}</span>
      </nav>
      <PageHeader
        title={profile.name}
        description={canManage ? undefined : "You can view this profile. Owners and admins can change it."}
        actions={
          <Link
            href={`/w/${workspaceId}/drafts?profile=${profile.id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View drafts →
          </Link>
        }
      />
      {profile.archivedAt && (
        <div className="mb-4">
          <Alert tone="warning">This profile is archived. It isn&apos;t offered for new drafts until it&apos;s restored.</Alert>
        </div>
      )}
      <ProfileForm
        workspaceId={workspaceId}
        profileId={profile.id}
        canManage={canManage}
        archived={profile.archivedAt !== null}
        initial={{
          name: profile.name,
          brandName: profile.brandName,
          description: profile.description,
          audience: profile.audience,
          products: profile.products,
          tone: profile.tone,
          writingPreferences: profile.writingPreferences,
          facts: profile.facts,
          prohibitedClaims: profile.prohibitedClaims,
          linkPolicy: profile.linkPolicy,
          allowedLinkDomains: profile.allowedLinkDomains,
          disclosure: profile.disclosure,
        }}
      />
    </>
  );
}
