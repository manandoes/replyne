import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not load env files on its own. `.env.local` is loaded
// first so it wins over `.env`, matching Next.js precedence. dotenv never
// overwrites a key that is already set, so an explicit DATABASE_URL (the test
// setup passes one for the test database) always takes priority.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Empty is fine for `prisma generate`; migrate commands fail with a clear
    // connection error until `.env.local` is configured (see .env.example).
    url: process.env["DATABASE_URL"] ?? "",
  },
});
