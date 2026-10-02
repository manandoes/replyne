import { APP_NAME } from "../shared/brand";

/**
 * The extension's permissions, kept deliberately small:
 *  - sidePanel      the UI
 *  - contextMenus   "Draft a reply" on selected text
 *  - storage        session token, preferences, the pending capture
 *  - activeTab      temporary access to the tab the user just invoked us on
 *  - scripting      read the selection in that tab (only after that user action)
 *
 * No content scripts, no reddit.com (or any site) host permission, no tabs,
 * history, or webRequest. The only host permission is our own API, so the
 * extension can call it without CORS.
 */
export const EXTENSION_PERMISSIONS = ["sidePanel", "contextMenus", "storage", "activeTab", "scripting"];

export function buildManifest({ apiBaseUrl, version }: { apiBaseUrl: string; version: string }) {
  const apiOrigin = new URL(apiBaseUrl).origin;
  return {
    manifest_version: 3,
    name: APP_NAME,
    description:
      "Draft replies to conversations you select. You review, edit, and post every reply yourself.",
    version,
    minimum_chrome_version: "116",
    action: { default_title: `Open ${APP_NAME}` },
    side_panel: { default_path: "sidepanel.html" },
    background: { service_worker: "background.js", type: "module" },
    permissions: EXTENSION_PERMISSIONS,
    host_permissions: [`${apiOrigin}/*`],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
}
