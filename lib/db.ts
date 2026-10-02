import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma client singleton (Prisma 7 connects through the pg driver adapter).
 * Cached on globalThis outside production so dev hot reloads don't open a new
 * pool each time.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and configure it.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 5, idleTimeoutMillis: 10_000 }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
