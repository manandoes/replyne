import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `.env.test` points tests at the separate replyline_test database.
const env = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "lib/generated/**", "extension/dist/**"],
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
