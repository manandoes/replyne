/**
 * Tenant scoping for workspace-owned rows. Use this instead of hand-writing
 * `workspaceId` so a forgotten filter can't leak another workspace's data.
 * The workspace is applied last, so a caller-supplied `workspaceId` can never
 * override the authorized one.
 */
export function scopedWhere<T extends Record<string, unknown>>(
  actor: { workspaceId: string },
  where?: T
): T & { workspaceId: string } {
  return { ...(where ?? ({} as T)), workspaceId: actor.workspaceId };
}
