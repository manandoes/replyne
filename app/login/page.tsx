import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@shared/brand";
import { Alert, Card } from "@shared/ui";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query.next);
  if (await getSessionUser()) redirect(next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-tight">{APP_NAME}</p>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Access is by invitation during the pilot.
          </p>
          {query.reason === "password_changed" && (
            <div className="mb-4">
              <Alert tone="success">Password changed. Sign in again with your new password.</Alert>
            </div>
          )}
          <LoginForm next={next} />
        </Card>
      </div>
    </main>
  );
}
