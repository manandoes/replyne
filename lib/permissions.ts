import type { Role } from "@/lib/generated/prisma/enums";

/**
 * Role → permission matrix. Enforced on the server for every request; the UI
 * only mirrors it.
 */
const MATRIX = {
  "workspace.read": ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  "draft.generate": ["OWNER", "ADMIN", "MEMBER"],
  "draft.feedback": ["OWNER", "ADMIN", "MEMBER"],
  "draft.delete_any": ["OWNER", "ADMIN"],
  "profile.manage": ["OWNER", "ADMIN"],
  "members.manage": ["OWNER", "ADMIN"],
  "audit.read": ["OWNER", "ADMIN"],
  "workspace.manage": ["OWNER", "ADMIN"],
  "workspace.delete": ["OWNER"],
  "watchlist.manage": ["OWNER", "ADMIN"],
  "conversation.read": ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  "conversation.manage": ["OWNER", "ADMIN", "MEMBER"],
  "opportunity.read": ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
  "opportunity.manage": ["OWNER", "ADMIN", "MEMBER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role, permission: Permission): boolean {
  return (MATRIX[permission] as readonly Role[]).includes(role);
}
