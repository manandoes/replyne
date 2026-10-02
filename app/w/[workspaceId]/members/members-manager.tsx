"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type RoleName } from "@shared/contracts";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@shared/ui";
import { mutate } from "@/components/api-client";
import { ConfirmButton } from "@/components/confirm-button";

type Member = { userId: string; name: string; email: string; role: RoleName; joined: string };
type Invite = { id: string; email: string; role: RoleName; invitedBy: string | null; expires: string };

const isBasic = (role: RoleName) => role === "MEMBER" || role === "VIEWER";

/** Mirrors lib/members.ts so the UI only offers what the server will allow. */
function assignableRoles(actorRole: RoleName, currentRole: RoleName): RoleName[] {
  if (actorRole === "OWNER") return [...ROLES];
  if (actorRole === "ADMIN" && isBasic(currentRole)) return ["MEMBER", "VIEWER"];
  return [];
}

export function MembersManager({
  workspaceId,
  me,
  myRole,
  members,
  invites,
  canManage,
}: {
  workspaceId: string;
  me: string;
  myRole: RoleName;
  members: Member[];
  invites: Invite[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; email: string; days: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const invitable: RoleName[] = myRole === "OWNER" ? ["ADMIN", "MEMBER", "VIEWER"] : ["MEMBER", "VIEWER"];
  const ownerCount = members.filter((member) => member.role === "OWNER").length;

  async function changeRole(userId: string, role: RoleName) {
    setError(null);
    const result = await mutate(`/api/workspaces/${workspaceId}/members/${userId}`, "PATCH", { role });
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    setCreated(null);
    setCopied(false);
    const result = await mutate<{ inviteUrl: string; expiresInDays: number }>(
      `/api/workspaces/${workspaceId}/invites`,
      "POST",
      { email, role: inviteRole }
    );
    setInviting(false);
    if (!result.ok) {
      setInviteError(result.fieldErrors.email ?? result.error);
      return;
    }
    setCreated({ url: result.data.inviteUrl, email, days: result.data.expiresInDays });
    setEmail("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
        </div>
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const self = member.userId === me;
            // The sole owner can't change their own role (the server would refuse).
            const soleOwner = member.role === "OWNER" && ownerCount === 1;
            const roles = (self && myRole !== "OWNER") || soleOwner ? [] : assignableRoles(myRole, member.role);
            const removable = !self && (myRole === "OWNER" || (myRole === "ADMIN" && isBasic(member.role)));
            return (
              <li key={member.userId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.name} {self && <span className="font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email} · joined {member.joined}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && roles.length > 1 ? (
                    <Select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      onChange={(event) => void changeRole(member.userId, event.target.value as RoleName)}
                      className="w-32"
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge>{ROLE_LABELS[member.role]}</Badge>
                  )}
                  {canManage && removable && (
                    <ConfirmButton
                      size="sm"
                      title={`Remove ${member.name}?`}
                      description="They lose access to this workspace immediately. Drafts they created stay in the workspace."
                      confirmLabel="Remove"
                      onConfirm={async () => {
                        const result = await mutate(`/api/workspaces/${workspaceId}/members/${member.userId}`, "DELETE");
                        if (!result.ok) return result.error;
                        router.refresh();
                        return null;
                      }}
                    >
                      Remove
                    </ConfirmButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {canManage && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Invite someone</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            You&apos;ll get a single-use link to send them yourself. It works only for that email address and expires
            after 7 days.
          </p>
          <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as RoleName)}
                className="w-32"
              >
                {invitable.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? "Creating…" : "Create invite link"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[inviteRole]}</p>
          {inviteError && (
            <div className="mt-3">
              <Alert tone="danger">{inviteError}</Alert>
            </div>
          )}
          {created && (
            <div className="mt-3 space-y-2 rounded-md border border-success/30 bg-success-surface p-3">
              <p className="text-sm font-medium">Invite link for {created.email}</p>
              <p className="text-xs text-muted-foreground">
                Copy it now — it won&apos;t be shown again. It expires in {created.days} days.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={created.url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(created.url);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {canManage && invites.length > 0 && (
        <Card>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Pending invites</h2>
          </div>
          <ul className="divide-y divide-border">
            {invites.map((pending) => (
              <li key={pending.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{pending.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[pending.role]}
                    {pending.invitedBy ? ` · invited by ${pending.invitedBy}` : ""} · expires {pending.expires}
                  </p>
                </div>
                {(myRole === "OWNER" || isBasic(pending.role)) && (
                  <ConfirmButton
                    size="sm"
                    title="Revoke this invite?"
                    description={`The link sent to ${pending.email} will stop working.`}
                    confirmLabel="Revoke"
                    onConfirm={async () => {
                      const result = await mutate(`/api/invites/${pending.id}`, "DELETE");
                      if (!result.ok) return result.error;
                      router.refresh();
                      return null;
                    }}
                  >
                    Revoke
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
