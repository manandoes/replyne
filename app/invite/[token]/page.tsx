import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@shared/brand";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@shared/contracts";
import { Alert, Button, Card, buttonClassName } from "@shared/ui";
import { findInviteByToken } from "@/lib/invites";
import { currentUser } from "@/lib/page-auth";
import { acceptInviteAction, registerFromInviteAction, signOutForInviteAction } from "./actions";
import { AcceptInviteForm, RegisterFromInviteForm } from "./invite-forms";

export const metadata: Metadata = { title: "Join a workspace" };

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-sm font-semibold tracking-tight">{APP_NAME}</p>
        <Card className="p-6">{children}</Card>
      </div>
    </main>
  );
}

const UNAVAILABLE: Record<string, string> = {
  invalid: "This invite link isn't valid. Check that you copied the whole link.",
  expired: "This invite has expired. Ask the person who invited you for a new link.",
  revoked: "This invite was revoked. Ask the person who invited you for a new link.",
  accepted: "This invite has already been used. Sign in to open the workspace.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [lookup, user] = await Promise.all([findInviteByToken(token), currentUser()]);
  const next = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  if (lookup.status !== "valid") {
    return (
      <Frame>
        <h1 className="text-lg font-semibold">Invite unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{UNAVAILABLE[lookup.status]}</p>
        <Link href={user ? "/" : "/login"} className={buttonClassName("secondary", "md", "mt-5 w-full")}>
          {user ? "Go to your workspaces" : "Sign in"}
        </Link>
      </Frame>
    );
  }

  const { invite } = lookup;
  const intro = (
    <>
      <h1 className="text-lg font-semibold">Join {invite.workspaceName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {invite.inviterName ? `${invite.inviterName} invited` : "You've been invited as"} {invite.email}
        {invite.inviterName ? " to join as " : " — "}
        <span className="font-medium text-foreground">{ROLE_LABELS[invite.role]}</span>.
      </p>
      <p className="mb-5 mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[invite.role]}</p>
    </>
  );

  if (user && user.email.toLowerCase() === invite.email) {
    return (
      <Frame>
        {intro}
        <AcceptInviteForm action={acceptInviteAction.bind(null, token)} workspaceName={invite.workspaceName} />
      </Frame>
    );
  }

  if (user) {
    return (
      <Frame>
        {intro}
        <Alert tone="warning">
          You&apos;re signed in as {user.email}, but this invite is for {invite.email}. Sign out, then sign in with
          that account.
        </Alert>
        <form action={signOutForInviteAction.bind(null, token)} className="mt-4">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out and switch account
          </Button>
        </form>
      </Frame>
    );
  }

  if (lookup.accountExists) {
    return (
      <Frame>
        {intro}
        <Link href={next} className={buttonClassName("primary", "md", "w-full")}>
          Sign in to accept
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      {intro}
      <RegisterFromInviteForm action={registerFromInviteAction.bind(null, token)} email={invite.email} />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Already have an account with this email?{" "}
        <Link href={next} className="underline">
          Sign in
        </Link>
      </p>
    </Frame>
  );
}
