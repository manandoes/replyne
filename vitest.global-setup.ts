import { execSync } from "node:child_process";
import { Client } from "pg";

/**
 * Makes sure the test database exists and is migrated before any test runs.
 * Requires the docker-compose Postgres (`npm run db:up`).
 */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("_test")) {
    throw new Error("Tests must run against a *_test database (see .env.test).");
  }

  const target = new URL(url);
  const database = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Can't reach Postgres at ${target.host}. Start it with "npm run db:up". (${(error as Error).message})`
    );
  }
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${database}"`);
  await client.end();

  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
