import { db } from "@/lib/db";

/**
 * Audit + product-analytics events. Metadata is restricted to small scalar
 * values, and keys that could carry content or credentials are dropped, so an
 * audit row can never hold Reddit text, draft text, notes, or tokens.
 */

export type AuditAction =
  | "extension.pairing_approved"
  | "extension.pairing_denied"
  | "extension.session_revoked"
  | "draft.generated"
  | "draft.regenerated"
  | "draft.edited"
  | "draft.copied"
  | "draft.feedback"
  | "draft.deleted"
  | "draft.source_deleted"
  | "profile.created"
  | "profile.updated"
  | "profile.archived"
  | "profile.restored"
  | "workspace.created"
  | "workspace.renamed"
  | "workspace.deleted"
  | "member.invited"
  | "member.invite_revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "account.updated"
  | "account.password_changed"
  | "retention.purged"
  | "watchlist.created"
  | "watchlist.updated"
  | "watchlist.deleted"
  | "conversation.created"
  | "conversation.updated"
  | "conversation.deleted"
  | "conversation.text_purged"
  | "opportunity.created"
  | "opportunity.updated"
  | "opportunity.stage_changed";

export type AuditMetadata = Record<string, string | number | boolean | null>;

const FORBIDDEN_KEY = /text|content|body|prompt|note|token|secret|password|email|reply|captured|instruction/i;
const MAX_KEYS = 20;
const MAX_STRING = 120;

export function sanitizeAuditMetadata(metadata: AuditMetadata = {}): AuditMetadata {
  const out: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata).slice(0, MAX_KEYS)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    out[key] = typeof value === "string" ? value.slice(0, MAX_STRING) : value;
  }
  return out;
}

type AuditClient = Pick<typeof db, "auditEvent">;

export async function recordAudit(
  event: {
    action: AuditAction;
    workspaceId?: string | null;
    actorUserId?: string | null;
    targetType?: string;
    targetId?: string;
    metadata?: AuditMetadata;
  },
  client: AuditClient = db
): Promise<void> {
  await client.auditEvent.create({
    data: {
      action: event.action,
      workspaceId: event.workspaceId ?? null,
      actorUserId: event.actorUserId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: sanitizeAuditMetadata(event.metadata),
    },
  });
}
