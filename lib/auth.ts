import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { clientIp } from "@/lib/api";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { consumeRateLimit, LIMITS } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

// Compared against when the user doesn't exist, so response timing doesn't
// reveal which emails have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("replyline-timing-equalizer"));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const ip = clientIp(request);
        const [perIp, perEmail] = await Promise.all([
          consumeRateLimit(`login:${ip}:${email}`, LIMITS.loginPerIpAndEmail),
          consumeRateLimit(`login:${email}`, LIMITS.loginPerEmail),
        ]);
        if (!perIp.ok || !perEmail.ok) throw new RateLimitedSignin();

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.disabledAt) {
          await verifyPassword(password, await getDummyHash());
          return null;
        }
        const valid = await verifyPassword(password, user.passwordHash);
        return valid
          ? { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion }
          : null;
      },
    }),
  ],
});

export type SessionUser = { id: string; email: string; name: string };

/**
 * The signed-in dashboard user, re-validated against the database. A session
 * issued before the user's last password change (older sessionVersion) is
 * no longer accepted.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, disabledAt: true, sessionVersion: true },
  });
  if (!user || user.disabledAt) return null;
  if ((session.sessionVersion ?? 0) !== user.sessionVersion) return null;
  return { id: user.id, email: user.email, name: user.name };
}

