import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { buildManifest } from "./manifest.config";

const root = import.meta.dirname;
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };

/** Emits manifest.json with the host permission matching the configured API. */
function manifest(apiBaseUrl: string): Plugin {
  return {
    name: "replyline-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(buildManifest({ apiBaseUrl, version }), null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "VITE_");
  const apiBaseUrl = env.VITE_API_BASE_URL || "http://localhost:3000";

  return {
    root,
    plugins: [react(), tailwindcss(), manifest(apiBaseUrl)],
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl) },
    resolve: { alias: { "@shared": path.resolve(root, "../shared") } },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "chrome116",
      modulePreload: { polyfill: false },
      sourcemap: mode === "development",
      rollupOptions: {
        input: {
          sidepanel: path.resolve(root, "sidepanel.html"),
          background: path.resolve(root, "src/background.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
