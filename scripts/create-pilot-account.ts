/**
 * Managed pilot onboarding (self-serve signup is deferred — see the PRD).
 *
 *   npm run pilot:create-account -- --email you@company.com --name "Your Name" \
 *     --workspace "Acme" --brand "Acme" [--profile "Acme — support voice"]
 *
 * Creates the user if needed (printing a generated password once), a
 * workspace with that user as OWNER, and a starter brand profile. Fill in the
 * profile's facts and voice before relying on drafts.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      workspace: { type: "string" },
      brand: { type: "string" },
      profile: { type: "string" },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const workspaceName = values.workspace?.trim();
  const brandName = values.brand?.trim();
  if (!email || !name || !workspaceName || !brandName) {
    console.error(
      'Usage: npm run pilot:create-account -- --email <email> --name "<name>" --workspace "<workspace>" --brand "<brand>" [--profile "<profile name>"]'
    );
    process.exit(1);
  }

  // Imported after env is loaded: lib/db reads DATABASE_URL at import time.
  const { db } = await import("../lib/db");
  const { hashPassword } = await import("../lib/passwords");

  let password: string | null = null;
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    password = randomBytes(12).toString("base64url");
    user = await db.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
  }

  const workspace = await db.workspace.create({
    data: {
      name: workspaceName,
      memberships: { create: { userId: user.id, role: "OWNER" } },
      brandProfiles: {
        create: { name: values.profile?.trim() || brandName, brandName },
      },
    },
    select: { id: true },
  });

  console.log(`Workspace "${workspaceName}" created (${workspace.id}) with ${email} as owner.`);
  if (password) {
    console.log(`New user password (shown once — share it securely): ${password}`);
  } else {
    console.log("User already existed; their password was not changed.");
  }
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
