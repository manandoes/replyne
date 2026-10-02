import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit";
import { formatUserCode, generateUserCode, hashSecret, normalizeUserCode } from "@/lib/extension-auth";
import { styleInstructionsFromReasons } from "@/lib/drafts/style-memory";
import { redact } from "@/lib/log";
import { can } from "@/lib/permissions";
import { windowStartFor } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";
import { scopedWhere } from "@/lib/tenant";
import { describeSourceUrl } from "@shared/reddit-url";

describe("permissions", () => {
  it("lets viewers read but not draft; only owners delete workspaces", () => {
    expect(can("VIEWER", "workspace.read")).toBe(true);
    expect(can("VIEWER", "draft.generate")).toBe(false);
    expect(can("MEMBER", "draft.generate")).toBe(true);
    expect(can("MEMBER", "profile.manage")).toBe(false);
    expect(can("ADMIN", "profile.manage")).toBe(true);
    expect(can("ADMIN", "workspace.delete")).toBe(false);
    expect(can("OWNER", "workspace.delete")).toBe(true);
  });
});

describe("scopedWhere", () => {
  it("applies the authorized workspace last so callers can't override it", () => {
    const where = scopedWhere({ workspaceId: "mine" }, { id: "d1", workspaceId: "theirs" });
    expect(where).toEqual({ id: "d1", workspaceId: "mine" });
  });
});

describe("pairing codes", () => {
  it("generates 8 consonants and round-trips through formatting and normalization", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateUserCode();
      expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
      expect(normalizeUserCode(formatUserCode(code))).toBe(code);
      expect(normalizeUserCode(formatUserCode(code).toLowerCase().replace("-", " "))).toBe(code);
    }
  });

  it("rejects malformed codes", () => {
    expect(normalizeUserCode("ABCD-EFGH")).toBeNull(); // vowels aren't in the alphabet
    expect(normalizeUserCode("BCDF")).toBeNull();
  });

  it("hashes deterministically without echoing the secret", () => {
    expect(hashSecret("rl_ext_abc")).toBe(hashSecret("rl_ext_abc"));
    expect(hashSecret("rl_ext_abc")).not.toContain("abc");
  });
});

describe("redaction", () => {
  it("never logs content or credentials", () => {
    const out = redact({
      route: "x",
      token: "rl_ext_secret",
      capturedText: "reddit text",
      nested: { authorization: "Bearer y", count: 2 },
    });
    expect(JSON.stringify(out)).not.toMatch(/rl_ext_secret|reddit text|Bearer y/);
    expect(out).toMatchObject({ route: "x", nested: { count: 2 } });
  });

  it("drops content-bearing keys from audit metadata", () => {
    expect(sanitizeAuditMetadata({ rating: "up", note: "private", replyText: "x", model: "m" })).toEqual({
      rating: "up",
      model: "m",
    });
  });
});

describe("helpers", () => {
  it("aligns rate-limit windows", () => {
    expect(windowStartFor(125_000, 60)).toBe(120_000);
  });

  it("only allows relative post-login redirects", () => {
    expect(safeNextPath("/extension/connect")).toBe("/extension/connect");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });

  it("turns repeated negative feedback into instructions", () => {
    expect(styleInstructionsFromReasons(["too_long", "too_long", "too_salesy", "helpful", "helpful"])).toEqual([
      "Keep replies shorter than you otherwise would.",
    ]);
  });

  it("describes source links without query strings, and only http(s)", () => {
    expect(describeSourceUrl("https://www.reddit.com/r/SaaS/comments/abc/title/?utm_source=share#x")).toEqual({
      url: "https://www.reddit.com/r/SaaS/comments/abc/title/",
      host: "www.reddit.com",
      isReddit: true,
      subreddit: "SaaS",
    });
    expect(describeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(describeSourceUrl("https://example.com/r/x")?.subreddit).toBeNull();
  });
});
