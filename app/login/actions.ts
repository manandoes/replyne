"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export type LoginState = { error: string | null };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeNextPath(formData.get("next")),
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as AuthError & { code?: string }).code;
      if (code === "rate_limited") {
        return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
      }
      return { error: "Incorrect email or password." };
    }
    throw error; // includes Next.js's redirect signal on success
  }
}
