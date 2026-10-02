import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@shared/brand";
import { ROLE_LABELS } from "@shared/contracts";
import { Button } from "@shared/ui";
import { signOut } from "@/lib/auth";
import type { Role } from "@/lib/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { NavLinks, WorkspaceSwitcher, type NavItem } from "./shell-client";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}

export function DashboardShell({
  user,
  workspaces,
  current,
  children,
}: {
  user: { name: string; email: string };
  workspaces: { id: string; name: string }[];
  current: { id: string; name: string; role: Role };
  children: ReactNode;
}) {
  const base = `/w/${current.id}`;
  const nav: NavItem[] = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/drafts`, label: "Drafts" },
    { href: `${base}/watchlists`, label: "Watchlists" },
    { href: `${base}/conversations`, label: "Conversations" },
    { href: `${base}/opportunities`, label: "Opportunities" },
    { href: `${base}/profiles`, label: "Brand profiles" },
    { href: `${base}/members`, label: "Members" },
    ...(can(current.role, "audit.read") ? [{ href: `${base}/audit`, label: "Audit log" }] : []),
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex flex-col gap-3 p-3 md:h-full md:gap-5 md:p-4">
          <div className="flex items-center justify-between">
            <Link href={base} className="text-sm font-semibold tracking-tight">
              {APP_NAME}
            </Link>
            <div className="flex items-center gap-1 md:hidden">
              <Link href="/account" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                Account
              </Link>
              <SignOutButton />
            </div>
          </div>
          <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
          <NavLinks items={nav} />
          <div className="mt-auto hidden space-y-2 border-t border-border pt-4 md:block">
            <Link href="/account" className="block rounded-md px-2 py-1.5 hover:bg-surface-muted">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.email} · {ROLE_LABELS[current.role]}
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

/** Pages outside a workspace (account, new workspace): brand bar + content. */
export function PlainShell({ backHref, children }: { backHref: string | null; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href={backHref ?? "/"} className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-2">
            {backHref && (
              <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
                Back to workspace
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
