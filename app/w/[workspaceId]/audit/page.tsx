import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@shared/ui";
import { formatDateTime, formatRelative } from "@/components/format";
import { AccessNote, EmptyState, PageHeader, SegmentedLinks } from "@/components/page-header";
import { AUDIT_CATEGORIES, listAuditEvents, type AuditCategory } from "@/lib/audit-data";
import { requireWorkspacePage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Audit log" };

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  all: "All",
  drafts: "Drafts",
  profiles: "Profiles",
  members: "Members",
  workspace: "Workspace",
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId } = await params;
  const { actor } = await requireWorkspacePage(workspaceId, `/w/${workspaceId}/audit`);
  const header = (
    <PageHeader
      title="Audit log"
      description="Important actions in this workspace. Entries record who did what and when — never draft or Reddit text."
    />
  );
  if (!can(actor.role, "audit.read")) {
    return (
      <>
        {header}
        <AccessNote>Only workspace owners and admins can view the audit log.</AccessNote>
      </>
    );
  }

  const query = await searchParams;
  const rawCategory = Array.isArray(query.category) ? query.category[0] : query.category;
  const category: AuditCategory = rawCategory && rawCategory in AUDIT_CATEGORIES ? (rawCategory as AuditCategory) : "all";
  const rawCursor = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
  const cursor = rawCursor && rawCursor.length <= 64 ? rawCursor : null;
  const { events, nextCursor } = await listAuditEvents(workspaceId, category, cursor);
  const base = `/w/${workspaceId}/audit`;
  const now = new Date();

  return (
    <>
      {header}
      <div className="mb-4">
        <SegmentedLinks
          label="Event category"
          options={(Object.keys(CATEGORY_LABELS) as AuditCategory[]).map((key) => ({
            href: key === "all" ? base : `${base}?category=${key}`,
            label: CATEGORY_LABELS[key],
            active: key === category,
          }))}
        />
      </div>
      {events.length === 0 ? (
        <EmptyState title="No events yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2 font-medium">When</th>
                <th scope="col" className="px-4 py-2 font-medium">Who</th>
                <th scope="col" className="px-4 py-2 font-medium">What</th>
                <th scope="col" className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => {
                const metadata = Object.entries((event.metadata ?? {}) as Record<string, unknown>);
                return (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      <time dateTime={event.createdAt.toISOString()} title={formatDateTime(event.createdAt)}>
                        {formatRelative(event.createdAt, now)}
                      </time>
                    </td>
                    <td className="px-4 py-2">{event.actorName}</td>
                    <td className="px-4 py-2">
                      {event.targetType === "draft" && event.targetId ? (
                        <Link href={`/w/${workspaceId}/drafts/${event.targetId}`} className="hover:underline">
                          {event.label}
                        </Link>
                      ) : (
                        event.label
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {metadata.length === 0
                        ? "—"
                        : metadata.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {(nextCursor || cursor) && (
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {cursor ? (
            <Link
              href={category === "all" ? base : `${base}?category=${category}`}
              className="text-muted-foreground hover:text-foreground"
            >
              ← Newest events
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link
              href={`${base}?${new URLSearchParams({ ...(category === "all" ? {} : { category }), cursor: nextCursor })}`}
              className="text-muted-foreground hover:text-foreground"
            >
              Older events →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
