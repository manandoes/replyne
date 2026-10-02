import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Page protection. Only checks that a session JWT exists — pages and API
 * routes re-validate the user and memberships in the database. API routes are
 * excluded: they answer with JSON 401s themselves.
 */
const { auth } = NextAuth(authConfig);

/** Reachable without a session: sign-in, and invite links (which handle both cases). */
const isPublic = (pathname: string) => pathname === "/login" || pathname.startsWith("/invite/");

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname) || request.auth) return NextResponse.next();

  const signIn = new URL("/login", request.nextUrl.origin);
  signIn.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
