import { describe, expect, it, vi } from "vitest";
import { buildManifest, EXTENSION_PERMISSIONS } from "../manifest.config";
import { createApiClient, toApiError } from "./api";
import { buildCapture, normalizeCapturedText } from "./capture";

describe("manifest", () => {
  const manifest = buildManifest({ apiBaseUrl: "https://app.replyline.example/", version: "0.1.0" });

  it("is MV3 with only the reviewed permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect([...manifest.permissions].sort()).toEqual(
      ["activeTab", "contextMenus", "scripting", "sidePanel", "storage"].sort()
    );
    expect(manifest.permissions).toBe(EXTENSION_PERMISSIONS);
  });

  it("can't watch browsing: no content scripts, no site access beyond our API", () => {
    expect(manifest).not.toHaveProperty("content_scripts");
    expect(manifest.host_permissions).toEqual(["https://app.replyline.example/*"]);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(/reddit\.com|<all_urls>|"tabs"|history|webRequest|cookies/);
  });

  it("does not use Reddit's name in the product name", () => {
    expect(manifest.name.toLowerCase()).not.toContain("reddit");
  });
});

describe("capture", () => {
  it("normalizes whitespace and invisible characters", () => {
    expect(normalizeCapturedText("  Hello​\r\n\r\n\r\n\r\nworld \n")).toEqual({
      text: "Hello\n\nworld",
      truncated: false,
    });
  });

  it("truncates very long selections and says so", () => {
    const result = normalizeCapturedText("x".repeat(9000));
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(8000);
  });

  it("includes the source link by default only for Reddit pages", () => {
    const reddit = buildCapture({
      text: "q",
      url: "https://www.reddit.com/r/SaaS/comments/1/x/?utm_source=share",
      method: "context_menu",
      capturedAt: 1,
    });
    expect(reddit?.includeSource).toBe(true);
    expect(reddit?.source?.url).toBe("https://www.reddit.com/r/SaaS/comments/1/x/");

    const other = buildCapture({ text: "q", url: "https://news.example.com/a", method: "toolbar", capturedAt: 1 });
    expect(other?.includeSource).toBe(false);
    expect(buildCapture({ text: "   ", url: null, method: "paste", capturedAt: 1 })).toBeNull();
  });
});

describe("API client", () => {
  it("sends the bearer token and maps errors to readable messages", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "This workspace reached today's drafting limit.", code: "rate_limited" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      })
    );
    const api = createApiClient({ baseUrl: "http://localhost:3000", getToken: async () => "rl_ext_t", fetchImpl });
    await expect(api.me()).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      message: "This workspace reached today's drafting limit. Try again in 30s.",
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rl_ext_t");
  });

  it("reports network failures and expired sessions clearly", async () => {
    const offline = createApiClient({
      baseUrl: "http://localhost:3000",
      getToken: async () => null,
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(offline.me()).rejects.toMatchObject({ code: "network_error" });
    expect(toApiError(401, {}, null).message).toContain("Reconnect");
  });
});
