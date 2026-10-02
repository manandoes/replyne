import { db } from "@/lib/db";

/** Workspace audit log for owners and admins. */

export const AUDIT_CATEGORIES = {
  all: null,
  drafts: "draft.",
  profiles: "profile.",
  members: "member.",
  workspace: "workspace.",
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "draft.generated": "Generated a draft",
  "draft.regenerated": "Regenerated a draft",
  "draft.edited": "Edited a draft",
  "draft.copied": "Copied a draft",
  "draft.feedback": "Rated a draft",
  "draft.deleted": "Deleted a draft",
  "draft.source_deleted": "Deleted a draft's source text",
  "profile.created": "Created a brand profile",
  "profile.updated": "Updated a brand profile",
  "profile.archived": "Archived a brand profile",
  "profile.restored": "Restored a brand profile",
  "workspace.created": "Created the workspace",
  "workspace.renamed": "Renamed the workspace",
  "member.invited": "Invited someone",
  "member.invite_revoked": "Revoked an invite",
  "member.joined": "Joined the workspace",
  "member.role_changed": "Changed a member's role",
  "member.removed": "Removed a member",
  "member.left": "Left the workspace",
};

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditEvents(workspaceId: string, category: AuditCategory, cursor: string | null) {
  const prefix = AUDIT_CATEGORIES[category];
  const rows = await db.auditEvent.findMany({
    where: { workspaceId, ...(prefix ? { action: { startsWith: prefix } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const events = rows.slice(0, AUDIT_PAGE_SIZE);

  const actorIds = [...new Set(events.map((event) => event.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));

  return {
    events: events.map((event) => ({
      ...event,
      actorName: event.actorUserId ? (names.get(event.actorUserId) ?? "Former user") : "System",
      label: AUDIT_ACTION_LABELS[event.action] ?? event.action,
    })),
    nextCursor: hasMore ? (events.at(-1)?.id ?? null) : null,
  };
}
