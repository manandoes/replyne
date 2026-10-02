import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@shared/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "AI-assisted reply drafting and conversation intelligence for teams on Reddit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
