import { describe, expect, it } from "vitest";
import { extractLinks, hasBlockingIssues, validateDraft, type DraftRules } from "./draft-validation";

const rules: DraftRules = {
  brandName: "Acme",
  facts: ["Acme has a free plan for up to 3 users.", "Acme syncs with Slack."],
  prohibitedClaims: ["best tool on the market"],
  linkPolicy: "ALLOWED_DOMAINS",
  allowedLinkDomains: ["acme.io"],
  disclosure: "",
};

const codes = (text: string, r = rules, claims?: { text: string; factIds: string[] }[]) =>
  validateDraft(text, r, claims).map((issue) => `${issue.severity}:${issue.code}`);

describe("validateDraft", () => {
  it("accepts a clean, fact-based reply", () => {
    expect(codes("Our team built Acme; it has a free plan for up to 3 users.")).toEqual([]);
  });

  it("blocks empty and over-long drafts", () => {
    expect(codes("   ")).toEqual(["block:empty"]);
    expect(codes("a".repeat(10_001))).toContain("block:too_long");
  });

  it("allows links only on allowed domains", () => {
    // Linking to the brand counts as mentioning it, so the reply states the affiliation.
    expect(codes("Our team's docs: https://docs.acme.io/start")).toEqual([]);
    expect(codes("See https://evil.example.com/x")).toContain("block:link_not_allowed");
    expect(codes("Try www.other.com")).toContain("block:link_not_allowed");
    expect(codes("check other.io/pricing")).toContain("block:link_not_allowed");
  });

  it("blocks every link when the policy is NEVER", () => {
    expect(codes("https://acme.io", { ...rules, linkPolicy: "NEVER" })).toContain("block:link_not_allowed");
  });

  it("blocks prohibited claims regardless of case, spacing, and punctuation", () => {
    expect(codes("Honestly the  BEST tool on the market.")).toContain("block:prohibited_claim");
    expect(codes("Honestly the best-tool on the market!")).toContain("block:prohibited_claim");
    expect(codes("Our team built Acme, the best toolkit on the marketplace.")).not.toContain("block:prohibited_claim");
  });

  it("blocks claims of being undetectable or human-written", () => {
    expect(codes("This reply is undetectable.")).toContain("block:evasion_claim");
    expect(codes("I'm not a bot, promise.")).toContain("block:evasion_claim");
    expect(codes("It can bypass the automod.")).toContain("block:evasion_claim");
  });

  it("warns on guarantees, personal experience, and unverified figures", () => {
    const result = codes("We guarantee results. I've been using it and it cut costs 40%.");
    expect(result).toEqual(
      expect.arrayContaining(["warn:guarantee", "warn:personal_experience", "warn:unverified_figure"])
    );
  });

  it("does not flag figures that appear in the verified facts", () => {
    expect(codes("Our free plan covers up to 3 users.")).not.toContain("warn:unverified_figure");
  });

  it("flags model claims that cite no valid fact", () => {
    const result = codes("Our team built Acme; it is SOC 2 certified.", rules, [
      { text: "Acme is SOC 2 certified", factIds: ["F9"] },
    ]);
    expect(result).toContain("warn:unsupported_claim");
    expect(
      codes("Our team built Acme; free plan for 3 users.", rules, [{ text: "free plan", factIds: ["f1"] }])
    ).not.toContain("warn:unsupported_claim");
  });

  it("asks for the configured disclosure when the brand is mentioned", () => {
    expect(codes("Acme can do that.")).toContain("warn:missing_disclosure");
    expect(codes("Acme can do that. (I work on Acme)", { ...rules, disclosure: "(I work on Acme)" })).not.toContain(
      "warn:missing_disclosure"
    );
    expect(codes("Acme can do that.", { ...rules, disclosure: "(I work on Acme)" })).toContain(
      "warn:missing_disclosure"
    );
    expect(
      codes("Disclosure: I work on Acme. It can do that.", { ...rules, disclosure: "(I work on Acme)" })
    ).not.toContain("warn:missing_disclosure");
  });

  it("reports whether anything blocks", () => {
    expect(hasBlockingIssues(validateDraft("See https://evil.com", rules))).toBe(true);
    expect(hasBlockingIssues(validateDraft("We guarantee it.", rules))).toBe(false);
  });
});

describe("extractLinks", () => {
  it("finds scheme, www, and bare-domain links without trailing punctuation", () => {
    expect(extractLinks("a https://x.com/y. b www.z.org, c acme.io/p!").sort()).toEqual(
      ["acme.io/p", "https://x.com/y", "www.z.org"].sort()
    );
  });

  it("ignores things that only look like domains", () => {
    expect(extractLinks("Built with Node.js, e.g. for APIs")).toEqual([]);
  });
});
