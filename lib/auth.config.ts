import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no Prisma) shared by `proxy.ts` and `lib/auth.ts`.
 * The JWT only carries the user id; every page and API call re-checks the
 * user and their memberships in the database.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      session.sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
