import { z } from "zod";
import { REDDIT_COMMENT_MAX_CHARS, type DraftRules, type ValidationIssue } from "./draft-validation";

/**
 * API contracts shared by the Next.js server and the browser extension.
 * Request bodies are validated with these schemas on the server; response
 * shapes are plain types (the server is their only producer).
 */

export const CAPTURED_TEXT_MAX_CHARS = 8_000;

export const TONE_OPTIONS = ["profile", "friendly", "professional", "concise", "empathetic"] as const;
export const LENGTH_OPTIONS = ["short", "medium", "long"] as const;
export const BRAND_MENTION_OPTIONS = ["if_relevant", "never"] as const;

export const TONE_LABELS: Record<(typeof TONE_OPTIONS)[number], string> = {
  profile: "Brand voice",
  friendly: "Friendly",
  professional: "Professional",
  concise: "Concise",
  empathetic: "Empathetic",
};
export const LENGTH_LABELS: Record<(typeof LENGTH_OPTIONS)[number], string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
};

export const FEEDBACK_REASONS = [
  "helpful",
  "on_brand",
  "too_long",
  "too_salesy",
  "off_topic",
  "wrong_tone",
  "inaccurate",
  "too_generic",
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  helpful: "Helpful",
  on_brand: "On brand",
  too_long: "Too long",
  too_salesy: "Too salesy",
  off_topic: "Off topic",
  wrong_tone: "Wrong tone",
  inaccurate: "Inaccurate",
  too_generic: "Too generic",
};
export const POSITIVE_REASONS: FeedbackReason[] = ["helpful", "on_brand"];
export const NEGATIVE_REASONS: FeedbackReason[] = [
  "too_long",
  "too_salesy",
  "off_topic",
  "wrong_tone",
  "inaccurate",
  "too_generic",
];

export const draftOptionsSchema = z.object({
  tone: z.enum(TONE_OPTIONS).default("profile"),
  length: z.enum(LENGTH_OPTIONS).default("medium"),
  brandMention: z.enum(BRAND_MENTION_OPTIONS).default("if_relevant"),
});
export type DraftOptions = z.infer<typeof draftOptionsSchema>;
export const DEFAULT_DRAFT_OPTIONS: DraftOptions = {
  tone: "profile",
  length: "medium",
  brandMention: "if_relevant",
};

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

const idSchema = z.string().trim().min(1).max(64);

export const generateDraftRequestSchema = z.object({
  workspaceId: idSchema,
  brandProfileId: idSchema,
  capturedText: z
    .string()
    .trim()
    .min(1, "Add the text you want to reply to.")
    .max(CAPTURED_TEXT_MAX_CHARS, `Keep the text under ${CAPTURED_TEXT_MAX_CHARS} characters.`),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(isHttpUrl, "Only http(s) links can be attached.")
    .nullish(),
  options: draftOptionsSchema.default(DEFAULT_DRAFT_OPTIONS),
  channel: z.enum(["extension", "dashboard"]).default("extension"),
});
export type GenerateDraftRequest = z.input<typeof generateDraftRequestSchema>;

export const regenerateDraftRequestSchema = z.object({
  options: draftOptionsSchema.optional(),
  instruction: z.string().trim().max(300, "Keep the instruction under 300 characters.").optional(),
});
export type RegenerateDraftRequest = z.input<typeof regenerateDraftRequestSchema>;

export const updateDraftRequestSchema = z.object({
  text: z.string().max(REDDIT_COMMENT_MAX_CHARS + 2_000),
});

export const feedbackRequestSchema = z.object({
  rating: z.enum(["up", "down"]),
  reasons: z.array(z.enum(FEEDBACK_REASONS)).max(FEEDBACK_REASONS.length).default([]),
  note: z.string().trim().max(500).default(""),
});
export type FeedbackRequest = z.input<typeof feedbackRequestSchema>;

export const startPairingRequestSchema = z.object({
  clientLabel: z.string().trim().min(1).max(60),
});
export const pollPairingRequestSchema = z.object({
  deviceCode: z.string().min(20).max(200),
});
export const decidePairingRequestSchema = z.object({
  userCode: z.string().trim().min(1).max(20),
  decision: z.enum(["approve", "deny"]),
});

// ---- Workspaces, members, invites, account (dashboard) ----

export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};
export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: "Everything, including managing admins and deleting the workspace.",
  ADMIN: "Manages brand profiles, members, and settings. Drafts replies.",
  MEMBER: "Drafts replies and gives feedback.",
  VIEWER: "Read-only access to drafts, profiles, and analytics.",
};

export const workspaceNameSchema = z.object({
  name: z.string().trim().min(1, "Give the workspace a name.").max(80, "Keep the name under 80 characters."),
});

export const deleteWorkspaceSchema = z.object({ confirmName: z.string().max(200) });

export const inviteRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export const updateMemberRequestSchema = z.object({ role: z.enum(ROLES) });

export const accountNameSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
});

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Keep the password under 200 characters.");

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: passwordSchema,
});

// ---- Brand profiles ----

export const LINK_POLICIES = ["NEVER", "ALLOWED_DOMAINS"] as const;

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Acme.io/docs?x" → "acme.io"; null when it isn't a hostname. */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
  value = value.replace(/:\d+$/, "").replace(/^www\./, "");
  return HOSTNAME.test(value) ? value : null;
}

/** Trims every entry and drops blank ones (forms submit empty rows). */
const lines = (itemMax: number, listMax: number, label: string) =>
  z
    .array(z.string())
    .default([])
    .transform((items) => items.map((item) => item.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().max(itemMax, `Keep each ${label} under ${itemMax} characters.`))
        .max(listMax, `Add at most ${listMax} ${label}s.`)
    );

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `Keep the ${label} under ${max} characters.`).default("");

export const brandProfileInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the profile a name.").max(80, "Keep the name under 80 characters."),
    brandName: z
      .string()
      .trim()
      .min(1, "Add the brand name as it would appear in a reply.")
      .max(80, "Keep the brand name under 80 characters."),
    description: optionalText(2000, "description"),
    audience: optionalText(1000, "audience"),
    products: optionalText(2000, "products list"),
    tone: optionalText(300, "tone"),
    writingPreferences: optionalText(2000, "writing preferences"),
    facts: lines(500, 50, "fact"),
    prohibitedClaims: lines(200, 50, "prohibited claim"),
    linkPolicy: z.enum(LINK_POLICIES).default("NEVER"),
    allowedLinkDomains: z
      .array(z.string().max(300))
      .max(20, "Add at most 20 domains.")
      .default([])
      .superRefine((items, ctx) => {
        items.forEach((item, index) => {
          if (item.trim() && !normalizeDomain(item)) {
            ctx.addIssue({ code: "custom", message: `"${item.trim()}" isn't a valid domain.`, path: [index] });
          }
        });
      })
      .transform((items) => [
        ...new Set(items.map(normalizeDomain).filter((domain): domain is string => domain !== null)),
      ]),
    disclosure: optionalText(200, "disclosure"),
  })
  .superRefine((profile, ctx) => {
    if (profile.linkPolicy === "ALLOWED_DOMAINS" && profile.allowedLinkDomains.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one allowed domain, or choose “No links”.",
        path: ["allowedLinkDomains"],
      });
    }
  });
export type BrandProfileInput = z.input<typeof brandProfileInputSchema>;

export const archiveProfileRequestSchema = z.object({ archived: z.boolean() });

// ---- Response shapes ----

export type ApiErrorBody = {
  error: string;
  code: string;
  fieldErrors?: Record<string, string>;
};

export type AiProviderName = "gemini" | "mock";

export type StartPairingResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
};

export type PollPairingResponse =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; token: string; expiresAt: string };

export type BrandProfileSummary = {
  id: string;
  name: string;
  brandName: string;
  tone: string;
  rules: DraftRules;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  canGenerate: boolean;
  brandProfiles: BrandProfileSummary[];
};

export type MeResponse = {
  user: { id: string; email: string; name: string };
  workspaces: WorkspaceSummary[];
  /** "unconfigured" means drafting will fail until the server is set up. */
  aiProvider: AiProviderName | "unconfigured";
  capturedTextRetentionHours: number;
  dashboardUrl: string;
};

export type DraftDto = {
  id: string;
  workspaceId: string;
  brandProfile: { id: string; name: string };
  text: string;
  generatedText: string;
  notes: string;
  issues: ValidationIssue[];
  aiProvider: string;
  model: string;
  options: DraftOptions;
  sourceUrl: string | null;
  sourceSubreddit: string | null;
  capturedTextAvailable: boolean;
  regeneratedFromId: string | null;
  createdAt: string;
  editedAt: string | null;
  copyCount: number;
};

export type DraftResponse = { draft: DraftDto };

export type FeedbackDto = {
  rating: "up" | "down";
  reasons: FeedbackReason[];
  note: string;
};

// ---- Intelligence: watchlists, conversations, opportunities ----

export const WATCHLIST_NAME_MAX = 80;
export const WATCHLIST_TERM_MAX = 200;
export const WATCHLIST_TERM_COUNT_MAX = 50;
export const CONVERSATION_TEXT_MAX = 8_000;
export const OPPORTUNITY_TITLE_MAX = 200;
export const OPPORTUNITY_NOTES_MAX = 2000;

export const WATCHLIST_TYPES = ["KEYWORD", "COMPETITOR"] as const;
export type WatchlistType = (typeof WATCHLIST_TYPES)[number];
export const WATCHLIST_TYPE_LABELS: Record<WatchlistType, string> = {
  KEYWORD: "Keyword",
  COMPETITOR: "Competitor",
};

export const CONVERSATION_SOURCES = ["CAPTURE", "MANUAL", "REDDIT_DATA_API"] as const;
export type ConversationSource = (typeof CONVERSATION_SOURCES)[number];
export const CONVERSATION_SOURCE_LABELS: Record<ConversationSource, string> = {
  CAPTURE: "Captured",
  MANUAL: "Manual paste",
  REDDIT_DATA_API: "Reddit Data API",
};

export const OPPORTUNITY_STAGES = [
  "NEW",
  "REVIEWING",
  "DRAFT_READY",
  "MANUALLY_CONTACTED",
  "FOLLOW_UP",
  "QUALIFIED",
  "CLOSED",
  "IRRELEVANT",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  DRAFT_READY: "Draft ready",
  MANUALLY_CONTACTED: "Manually contacted",
  FOLLOW_UP: "Follow-up",
  QUALIFIED: "Qualified",
  CLOSED: "Closed",
  IRRELEVANT: "Irrelevant",
};
export const RESOLVED_STAGES: OpportunityStage[] = ["QUALIFIED", "CLOSED", "IRRELEVANT"];

// ---- Watchlists ----

const watchlistTermSchema = z
  .array(z.string().trim().max(WATCHLIST_TERM_MAX, `Keep each term under ${WATCHLIST_TERM_MAX} characters.`))
  .transform((items) => items.filter(Boolean))
  .pipe(z.array(z.string()).max(WATCHLIST_TERM_COUNT_MAX));

export const createWatchListSchema = z.object({
  name: z.string().trim().min(1, "Give the watchlist a name.").max(WATCHLIST_NAME_MAX),
  type: z.enum(WATCHLIST_TYPES).default("KEYWORD"),
  terms: watchlistTermSchema.default([]),
  subreddit: z.string().trim().max(100).optional().or(z.literal("")),
});
export type CreateWatchListInput = z.input<typeof createWatchListSchema>;

export const updateWatchListSchema = z.object({
  name: z.string().trim().min(1).max(WATCHLIST_NAME_MAX).optional(),
  terms: watchlistTermSchema.optional(),
  subreddit: z.string().trim().max(100).optional().or(z.literal("")),
  active: z.boolean().optional(),
});
export type UpdateWatchListInput = z.input<typeof updateWatchListSchema>;

export type WatchListSummary = {
  id: string;
  name: string;
  type: WatchlistType;
  terms: string[];
  subreddit: string | null;
  active: boolean;
  conversationCount: number;
  createdAt: string;
};

// ---- Conversations ----

export const createConversationSchema = z.object({
  sourceType: z.enum(CONVERSATION_SOURCES).default("MANUAL"),
  sourceUrl: z.string().trim().max(2048).optional().or(z.literal("")),
  text: z
    .string()
    .trim()
    .min(1, "Paste the conversation text.")
    .max(CONVERSATION_TEXT_MAX, `Keep the text under ${CONVERSATION_TEXT_MAX} characters.`)
    .optional(),
  title: z.string().trim().max(300).optional().or(z.literal("")),
  author: z.string().trim().max(100).optional().or(z.literal("")),
  watchListId: z.string().trim().max(64).optional().or(z.literal("")),
});
export type CreateConversationInput = z.input<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  title: z.string().trim().max(300).optional().or(z.literal("")),
  author: z.string().trim().max(100).optional().or(z.literal("")),
  summary: z.string().trim().max(500).optional().or(z.literal("")),
  watchListId: z.string().trim().max(64).optional().or(z.literal("")),
});
export type UpdateConversationInput = z.input<typeof updateConversationSchema>;

export type ConversationSummary = {
  id: string;
  workspaceId: string;
  watchListId: string | null;
  sourceType: ConversationSource;
  sourceUrl: string | null;
  sourceSubreddit: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  textAvailable: boolean;
  lastCommentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---- Opportunities ----

export const createOpportunitySchema = z.object({
  conversationId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Add a title.").max(OPPORTUNITY_TITLE_MAX),
  notes: z.string().trim().max(OPPORTUNITY_NOTES_MAX).default(""),
});
export type CreateOpportunityInput = z.input<typeof createOpportunitySchema>;

export const updateOpportunitySchema = z.object({
  title: z.string().trim().min(1).max(OPPORTUNITY_TITLE_MAX).optional(),
  notes: z.string().trim().max(OPPORTUNITY_NOTES_MAX).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
});
export type UpdateOpportunityInput = z.input<typeof updateOpportunitySchema>;

export const advanceOpportunitySchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});
export type AdvanceOpportunityInput = z.input<typeof advanceOpportunitySchema>;

export type OpportunitySummary = {
  id: string;
  workspaceId: string;
  conversationId: string;
  title: string;
  stage: OpportunityStage;
  notes: string;
  lastContactAt: string | null;
  resolvedAt: string | null;
  conversation: { id: string; title: string | null; sourceUrl: string | null };
  createdAt: string;
  updatedAt: string;
};
