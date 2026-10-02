import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "@shared/contracts";
import { PlainShell } from "@/components/dashboard-shell";
import { formatDate, formatRelative } from "@/components/format";
import { listExtensionSessions } from "@/lib/account";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";
import { ExtensionSessions, NameForm, PasswordForm, Section } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requirePageUser("/account");
  const now = new Date();
  const [sessions, memberships] = await Promise.all([
    listExtensionSessions(user.id, now),
    db.membership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, workspace: { select: { id: true, name: true } } },
    }),
  ]);
  const back = memberships[0] ? `/w/${memberships[0].workspace.id}` : null;

  return (
    <PlainShell backHref={back}>
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      <div className="mt-6 space-y-4">
        <Section title="Profile">
          <NameForm name={user.name} />
        </Section>
        <Section title="Connected browser extensions">
          <ExtensionSessions
            sessions={sessions.map((session) => ({
              id: session.id,
              label: session.label,
              connected: formatDate(session.createdAt),
              lastUsed: formatRelative(session.lastUsedAt, now),
              expires: formatDate(session.expiresAt),
            }))}
          />
        </Section>
        <Section title="Password">
          <PasswordForm />
        </Section>
        <Section title="Workspaces">
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">You aren&apos;t in any workspace.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {memberships.map(({ role, workspace }) => (
                <li key={workspace.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <Link href={`/w/${workspace.id}`} className="hover:underline">
                    {workspace.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/workspaces/new" className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">
            + New workspace
          </Link>
        </Section>
      </div>
    </PlainShell>
  );
}
