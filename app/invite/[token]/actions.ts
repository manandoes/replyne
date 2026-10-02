"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accountNameSchema, passwordSchema } from "@shared/contracts";
import { getSessionUser, signIn, signOut } from "@/lib/auth";
import { acceptInviteAsUser, registerFromInvite } from "@/lib/invites";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";

export type InviteFormState = { error: string | null; fieldErrors?: Record<string, string> };

async function allowAttempt(): Promise<boolean> {
  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local";
  return (await consumeRateLimit(`invite:accept:${ip}`, LIMITS.inviteAcceptPerIp)).ok;
}

/** Signed-in invitee joins the workspace. */
export async function acceptInviteAction(token: string): Promise<InviteFormState> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  if (!(await allowAttempt())) return { error: "Too many attempts. Wait a few minutes and try again." };

  const result = await acceptInviteAsUser(token, user);
  if (!result.ok) return { error: result.message };
  redirect(`/w/${result.workspaceId}`);
}

/** New invitee creates an account, joins, and is signed in. */
export async function registerFromInviteAction(
  token: string,
  _previous: InviteFormState,
  formData: FormData
): Promise<InviteFormState> {
  if (!(await allowAttempt())) return { error: "Too many attempts. Wait a few minutes and try again." };

  const name = accountNameSchema.safeParse({ name: formData.get("name") });
  const password = passwordSchema.safeParse(formData.get("password"));
  const fieldErrors: Record<string, string> = {};
  if (!name.success) fieldErrors.name = name.error.issues[0]?.message ?? "Enter your name.";
  if (!password.success) fieldErrors.password = password.error.issues[0]?.message ?? "Choose a password.";
  if (password.success && formData.get("confirm") !== password.data) fieldErrors.confirm = "The passwords don't match.";
  if (!name.success || !password.success || fieldErrors.confirm) return { error: null, fieldErrors };

  const result = await registerFromInvite(token, { name: name.data.name, password: password.data });
  if (!result.ok) return { error: result.message };

  try {
    await signIn("credentials", {
      email: result.email,
      password: password.data,
      redirectTo: `/w/${result.workspaceId}`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Your account was created, but signing in failed. Sign in with your new password." };
    }
    throw error; // Next.js redirect after a successful sign-in
  }
  return { error: null };
}

export async function signOutForInviteAction(token: string) {
  await signOut({ redirectTo: `/login?next=${encodeURIComponent(`/invite/${token}`)}` });
}
