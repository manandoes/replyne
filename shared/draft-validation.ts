/**
 * Deterministic checks on a draft reply, shared by the server (authoritative,
 * stored with the draft) and the extension (live while the user edits).
 *
 * These back up the prompt rules rather than trusting the model: they catch
 * fabricated claims, disallowed links, and anti-moderation language whether
 * they came from the model, from prompt injection, or from an edit.
 *
 *  - "block": the draft should not be copied until it is fixed.
 *  - "warn":  a human decides; shown next to the draft.
 */

export type IssueSeverity = "block" | "warn";

export type IssueCode =
  | "empty"
  | "too_long"
  | "link_not_allowed"
  | "prohibited_claim"
  | "evasion_claim"
  | "guarantee"
  | "personal_experience"
  | "unverified_figure"
  | "unsupported_claim"
  | "missing_disclosure";

export type ValidationIssue = {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  excerpt?: string;
};

export type DraftRules = {
  brandName: string;
  facts: string[];
  prohibitedClaims: string[];
  linkPolicy: "NEVER" | "ALLOWED_DOMAINS";
  allowedLinkDomains: string[];
  disclosure: string;
};

export type ModelClaim = { text: string; factIds: string[] };

/** Reddit rejects comments longer than this. */
export const REDDIT_COMMENT_MAX_CHARS = 10_000;

const URL_PATTERN = /\bhttps?:\/\/[^\s)\]>"']+|\bwww\.[^\s)\]>"']+/gi;
// Bare domains ("acme.io/pricing") — limited to common TLDs to avoid matching
// things like "Node.js" or "e.g.".
const BARE_DOMAIN_PATTERN =
  /\b(?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|org|app|dev|so|gg|xyz|me|us|uk|ca|de|in)\b(?:\/[^\s)\]>"']*)?/gi;

const EVASION_PATTERN =
  /\b(?:undetectable|ban[- ]?proof|won'?t (?:get |be )?(?:detected|flagged|banned)|bypass(?:es|ing)? (?:the )?(?:filters?|automod|spam filters?|moderation)|not (?:a )?bot|not written by (?:an )?ai|(?:100% )?human[- ]written)\b/i;

const GUARANTEE_PATTERN =
  /\b(?:guarantee[sd]?|risk[- ]free|100% (?:safe|secure|accurate|uptime|success|guaranteed)|never (?:fails|breaks|goes down))\b/i;

const PERSONAL_EXPERIENCE_PATTERNS = [
  /\b(?:I|we)(?:'ve| have) (?:been )?(?:using|used|tried|switched to)\b/i,
  /\bin my (?:own )?experience\b/i,
  /\bas a (?:long[- ]?time |happy |former )?(?:customer|user|client)\b/i,
  /\bmy (?:wife|husband|boss|friend|clients?|customers?)\b/i,
  /\bI(?:'m| am) (?:an? )?(?:independent|unbiased|neutral)\b/i,
];

const FIGURE_PATTERN =
  /(?:[$€£]\s?\d[\d,.]*(?:\s?[kmb]\b)?|\b\d[\d,.]*\s?(?:%|percent\b|x\b|k\b|users\b|customers\b|clients\b|teams\b|companies\b|hours?\b|days?\b|minutes?\b|seconds?\b))/gi;

const AFFILIATION_PATTERN =
  /\b(?:I work (?:at|for|on)|our (?:team|product|company|tool)|we (?:built|make|run|created)|disclosure|I'?m (?:the |a )?(?:founder|co-?founder|ceo|cto|part of|on the team))\b/i;

/**
 * Case-, punctuation-, and spacing-insensitive form used for phrase matching,
 * so "Disclosure: I work on Acme" satisfies "(I work on Acme)" and
 * "best-tool on the market" still trips "best tool on the market".
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Whole-token containment on normalized text ("1" doesn't match "10"). */
function containsPhrase(text: string, phrase: string): boolean {
  const needle = normalize(phrase);
  return needle !== "" && ` ${normalize(text)} `.includes(` ${needle} `);
}

function hostOf(candidate: string): string | null {
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAllowedHost(host: string, allowed: string[]): boolean {
  return allowed.some((entry) => {
    const domain = entry.toLowerCase().trim().replace(/^www\./, "");
    return domain !== "" && (host === domain || host.endsWith(`.${domain}`));
  });
}

export function extractLinks(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) found.add(match[0]);
  const withoutUrls = text.replace(URL_PATTERN, " ");
  for (const match of withoutUrls.matchAll(BARE_DOMAIN_PATTERN)) found.add(match[0]);
  return [...found].map((link) => link.replace(/[.,;:!?]+$/, ""));
}

function checkLinks(text: string, rules: DraftRules): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const link of extractLinks(text)) {
    const host = hostOf(link);
    const allowed =
      rules.linkPolicy === "ALLOWED_DOMAINS" &&
      host !== null &&
      isAllowedHost(host, rules.allowedLinkDomains);
    if (!allowed) {
      issues.push({
        code: "link_not_allowed",
        severity: "block",
        message:
          rules.linkPolicy === "NEVER"
            ? "This brand profile doesn't allow links in replies."
            : "Link is not on this brand profile's allowed domains.",
        excerpt: link,
      });
    }
  }
  return issues;
}

function appearsInFacts(phrase: string, facts: string[]): boolean {
  return facts.some((fact) => containsPhrase(fact, phrase));
}

function checkFigures(text: string, facts: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(FIGURE_PATTERN)) {
    const figure = match[0].trim();
    const digits = figure.replace(/[^\d.]/g, "").replace(/\.$/, "");
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    const inFacts = facts.some((fact) => fact.replace(/,/g, "").includes(digits));
    if (!inFacts) {
      issues.push({
        code: "unverified_figure",
        severity: "warn",
        message: "Figure not found in this profile's verified facts.",
        excerpt: figure,
      });
    }
  }
  return issues;
}

function checkClaims(claims: ModelClaim[], factCount: number): ValidationIssue[] {
  const validIds = new Set(Array.from({ length: factCount }, (_, i) => `F${i + 1}`));
  return claims
    .filter((claim) => !claim.factIds.some((id) => validIds.has(id.trim().toUpperCase())))
    .map((claim) => ({
      code: "unsupported_claim" as const,
      severity: "warn" as const,
      message: "Claim isn't backed by a verified fact.",
      excerpt: claim.text.slice(0, 160),
    }));
}

function checkDisclosure(text: string, rules: DraftRules): ValidationIssue[] {
  const brand = rules.brandName.trim();
  if (!brand) return [];
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${escaped}\\b`, "i").test(text)) return [];

  const disclosure = rules.disclosure.trim();
  if (disclosure) {
    if (containsPhrase(text, disclosure)) return [];
    return [
      {
        code: "missing_disclosure",
        severity: "warn",
        message: `Mentions ${brand} without your disclosure ("${disclosure}").`,
      },
    ];
  }
  if (AFFILIATION_PATTERN.test(text)) return [];
  return [
    {
      code: "missing_disclosure",
      severity: "warn",
      message: `Mentions ${brand} — make your affiliation clear.`,
    },
  ];
}

export function validateDraft(
  text: string,
  rules: DraftRules,
  modelClaims?: ModelClaim[]
): ValidationIssue[] {
  if (!text.trim()) {
    return [{ code: "empty", severity: "block", message: "The draft is empty." }];
  }

  const issues: ValidationIssue[] = [];

  if (text.length > REDDIT_COMMENT_MAX_CHARS) {
    issues.push({
      code: "too_long",
      severity: "block",
      message: `Reddit comments are limited to ${REDDIT_COMMENT_MAX_CHARS.toLocaleString("en-US")} characters.`,
    });
  }

  issues.push(...checkLinks(text, rules));

  for (const claim of rules.prohibitedClaims) {
    if (containsPhrase(text, claim)) {
      issues.push({
        code: "prohibited_claim",
        severity: "block",
        message: "Contains a claim this brand profile prohibits.",
        excerpt: claim,
      });
    }
  }

  const evasion = EVASION_PATTERN.exec(text);
  if (evasion) {
    issues.push({
      code: "evasion_claim",
      severity: "block",
      message: "Don't claim a reply is human-written, undetectable, or able to avoid moderation.",
      excerpt: evasion[0],
    });
  }

  const guarantee = GUARANTEE_PATTERN.exec(text);
  if (guarantee && !appearsInFacts(guarantee[0], rules.facts)) {
    issues.push({
      code: "guarantee",
      severity: "warn",
      message: "Guarantee language that isn't in your verified facts.",
      excerpt: guarantee[0],
    });
  }

  for (const pattern of PERSONAL_EXPERIENCE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      issues.push({
        code: "personal_experience",
        severity: "warn",
        message: "Personal-experience claim — keep it only if it's true for the person posting.",
        excerpt: match[0],
      });
      break;
    }
  }

  issues.push(...checkFigures(text, rules.facts));
  if (modelClaims) issues.push(...checkClaims(modelClaims, rules.facts.length));
  issues.push(...checkDisclosure(text, rules));

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "block");
}
