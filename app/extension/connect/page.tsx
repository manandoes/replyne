import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@shared/brand";
import { Card } from "@shared/ui";
import { getSessionUser } from "@/lib/auth";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "Connect the browser extension" };

export default async function ConnectExtensionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/extension/connect");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-sm font-semibold tracking-tight">{APP_NAME}</p>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Connect the browser extension</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>. The extension
            will be able to draft replies with your workspaces&apos; brand profiles. It can&apos;t post
            anything, and you can sign it out at any time.
          </p>
          <ConnectForm />
        </Card>
      </div>
    </main>
  );
}
