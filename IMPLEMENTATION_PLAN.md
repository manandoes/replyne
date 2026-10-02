# Implementation Plan — Reddit Engagement Assistant (Extension + Dashboard)

Working name: **Replyline** (placeholder — see Risk R7; Reddit's terms forbid "Reddit" in an app name).
Last updated: 2026-09-30.

## 1. Current implementation status (audit, 2026-09-29)

| Area | Status |
|---|---|
| Source code, package manifest, schema, API routes, auth, AI integration, UI | **None.** The repository contains only `PRD_Revised.md`, `Architecture_Revised.md`, `Claude_Code_Master_Builder_Prompt_Revised.md`. |
| Git | The folder is untracked inside the parent `Web Projects` repository. No uncommitted code to preserve. The three documents are left unmodified. |
| Completed / partial features | None / none. |

So "adapt the existing work" means: adopt the product and safety requirements of the two documents, adopt the conventions of the owner's recent projects (Next.js 16 App Router, Prisma 7 + `@prisma/adapter-pg`, Postgres via docker-compose, Auth.js v5, zod 4, vitest against a real database, Tailwind v4), and apply the **2026-09-29 direction update** (browser extension + SaaS dashboard). Where the update and the PRD differ (e.g. the PRD's own-post reply inbox), the update wins; the PRD's constraints (human-in-the-loop, no autonomous posting, tenant isolation, deletion/retention, audit) still apply.

## 2. Verified platform constraints (checked 2026-09-29)

| Source (last edit) | Finding | Consequence here |
|---|---|---|
| [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564) (2026-06-05) | Approval required before **any** Data API access. Commercial use needs explicit written approval. No automated posts/comments/DMs, incl. "identical or substantially similar content across subreddits". No unapproved commercialization or AI training. No inferring sensitive traits or re-identification. | Every Reddit API feature ships **disabled**. The product never posts. Repetition warnings on drafts. |
| [Developer Platform & Accessing Reddit Data](https://support.reddithelp.com/hc/en-us/articles/14945211791892) (2026-05-28) | Any use "by a business or on behalf of a business" is commercial and needs permission plus a contract. | The private pilot is already commercial use, so the gate applies to it too. |
| [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092) (2026-05-11) | OAuth required. User-Agent format `<platform>:<app ID>:<version> (by /u/<name>)`. Limit is 100 QPM per OAuth client, averaged over 10 min, with `X-Ratelimit-*` headers. Delete content deleted on Reddit; strip author info for deleted accounts; "strongly recommend" deleting stored content within 48 h. | Captured Reddit text is retained 48 h by default. The Phase 4 client is rate-limit aware. |
| [Data API Terms](https://redditinc.com/policies/data-api-terms) (rev. 2026-07-20) | Display-only license. Don't modify User Content except formatting. No ML training. Don't retain beyond the approved use case. On termination, delete cached and derived data. | Derived data is purged with its source. A platform purge command (Phase 4). |
| [Developer Terms](https://redditinc.com/policies/developer-terms) (rev. 2026-03-24) | Attribute content (link, username, "from Reddit"). Update or delete content that is edited, removed, or deleted "as soon as possible". No surveillance. | Attribution in the UI. Reconciliation job for API-sourced records (Phase 4). |
| [Devvit docs](https://developers.reddit.com/docs/devvit_rules) | User actions (`runAs:'USER'`) only on an explicit manual action, after review. External fetch domains are allowlisted. Approved LLMs: **Gemini, OpenAI**. No off-platform profiles. Account-linked services need SOC 2 Type II plus a pentest. | Devvit is not used now; documented as a future option. Gemini chosen as the AI provider. |
| [Live API reference](https://www.reddit.com/dev/api) + OAuth2 wiki | Verified: `GET /api/v1/me` (identity), `GET /api/info`, `/comments/{article}`, `/api/morechildren` (read), `/search` (read, commercially gated), `POST /api/comment` (submit), `revoke_token`. | The Phase 4 adapter requests `identity read` only. `submit` and `privatemessages` are never requested. |

Owner decisions (2026-09-29): manual workflow plus a gated Data API adapter; Google Gemini as the LLM.

## 3. Product boundaries (non-negotiable)

- A drafting and intelligence assistant. **Users post on Reddit themselves.** No code path posts, votes, follows, or DMs, and no posting scope is ever requested.
- The extension captures text only on explicit user action: context-menu "Draft a reply", clicking the toolbar icon with text selected, or pasting. There are **no content scripts**, no reddit.com host permission, no background monitoring, and no Reddit DOM selectors.
- The AI has no tools or credentials. Its output is structured and schema-validated. Reddit text is wrapped as untrusted data, and injected instructions are ignored and caught by output validators.
- Reddit monitoring and discovery stay disabled and labeled "Pending approval" until written approval is recorded in configuration. The UI never claims monitoring is active without a connected, data-returning source.
- Tenant isolation is enforced server-side. Important actions are audited with metadata only (no content). Logs are redacted. Captured text has a retention TTL.
- No fabricated metrics. "Copied" is observed; "posted" is never claimed.

## 4. Target architecture

```
Chrome/Edge MV3 extension (side panel) ──Bearer (extension session)──┐
Dashboard (Next.js pages, Auth.js session cookie) ────────────────────┤
                                                                       ▼
                                             Next.js route handlers (/api/*)
                                   authn → membership/role → tenant-scoped service
                                        │                    │
                          AI orchestrator (Gemini | Mock)   Postgres (Prisma 7)
                          no tools, JSON schema, validators  │
                                        │                    └─ Monitoring providers (Phase 4):
                                  shared/ contracts             user capture (active), Reddit Data API (gated off),
                                  + draft validation            Devvit (not built)
```

**Repository layout** (single repo; npm workspace only for the extension):
- `/` — Next.js 16 app: dashboard pages and API (`app/`, `lib/`, `prisma/`, `scripts/`)
- `/extension` — MV3 extension (Vite + React + TypeScript), an npm workspace
- `/shared` — API contracts (zod), draft-validation rules, UI primitives, and theme tokens, imported by both via the `@shared/*` alias. No separate package build.
- `/docs` — compliance notes, extension guide, release checklist

**Data model** (all tenant data carries `workspaceId`):

| Model | Purpose | Phase |
|---|---|---|
| User | email, name, passwordHash, disabledAt | 2 |
| Workspace | tenant boundary | 2 |
| Membership | role `OWNER / ADMIN / MEMBER / VIEWER` | 2 |
| BrandProfile | name, description, audience, products, tone, writing preferences, verified facts, prohibited claims, link policy + allowed domains, disclosure text (several per workspace) | 2 |
| ExtensionPairing | device-authorization pairing (hashed device code, typed user code, 10-min TTL) | 2 |
| ExtensionSession | hashed bearer token, label, lastUsedAt, 30-day expiry, revokedAt | 2 |
| Draft | profile used, author, channel, captured text (TTL-purged), source URL/subreddit, options, generated text, current text, validation issues, model, prompt version, regeneration chain | 2 |
| DraftFeedback | up/down, reasons, note — one per user per draft | 2 |
| AuditEvent | important actions + product analytics (metadata only) | 2 |
| RateLimitCounter | fixed-window counters (Postgres) | 2 |
| Invite | email invitations with hashed tokens | 3 |
| Watchlist / WatchTerm | competitor / brand / keyword / topic terms | 4 |
| IntegrationConnection (+ encrypted ConnectionSecret) | provider, method, status `NOT_CONFIGURED / PENDING_APPROVAL / CONNECTED / ERROR / DISCONNECTED` | 4 |
| Conversation | authorized conversation record: provider, method, external id, permalink, subreddit, text (TTL), matched terms, classification, status | 4 |
| Opportunity | pipeline New → Reviewing → Draft Ready → Manually Contacted → Follow-up → Qualified / Closed / Irrelevant; owner, notes, tags, next action, reminder | 4 |

**Roles:** VIEWER reads; MEMBER also generates drafts, gives feedback, and works the pipeline; ADMIN also manages profiles, watchlists, integrations, and members; OWNER also manages owners/admins and deletes the workspace.

**Extension authentication** (shared account, no secrets in extension code; device-authorization pattern, RFC 8628 style):
1. The extension calls `POST /api/ext/pair/start` and gets `{deviceCode, userCode, verificationUri}`. Only hashes are stored server-side.
2. The extension shows the code and opens `/extension/connect`. The signed-in user **types** the code and approves (no prefill, which blunts phishing links).
3. The extension polls `POST /api/ext/pair/poll` and receives an opaque bearer token **exactly once**. It is stored in `chrome.storage.local` and hashed server-side, and is revocable (sign-out now; a dashboard list in Phase 3).
4. Every API call re-resolves user → membership → role on the server. The extension fetches only its own API origin (a host permission).

**Draft pipeline:** authn → membership (`draft.generate`) → profile scoped to the workspace → rate limit and quota → prompt (trusted profile + workspace-only style memory + options + `<untrusted_reddit_text>` block) → Gemini JSON-schema output (no tools) → zod parse → deterministic validators (shared) → at most one automatic revision if blocking issues → persist → audit. The client re-runs the same shared validators live while the user edits. Copy is disabled while blocking issues remain.

## 5. Reuse, refactor, new

- **Reuse (this repo):** requirements in the two documents (unmodified).
- **Reuse (conventions re-implemented here, not imported):** Prisma 7 adapter-pg singleton; `scopedWhere` tenant helper with the tenant key applied last; AES-256-GCM secret box (Phase 4 tokens); `{error, code, fieldErrors?}` API errors; `CRON_SECRET`-guarded job endpoints; vitest against a migrated Postgres.
- **Refactor:** none (no code exists). The earlier inbox-first plan (confirm-to-post via `POST /api/comment`) is **dropped**, because the new direction has no in-product publishing.
- **New:** everything in section 4.

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Reddit denies or limits commercial approval. | Core value (extension drafting) works without the Reddit API; gated features stay off. |
| R2 | Processing user-captured Reddit text in a paid SaaS may count as commercializing "Reddit data" under the Responsible Builder Policy. | Keep the pilot private and unbilled. 48 h retention. No training. Get Reddit/legal confirmation before billing. |
| R3 | LLM data terms. | Use the Gemini paid tier (no training on prompts); disclose it in the privacy policy; confirm in Reddit's review. |
| R4 | Prompt injection cannot be fully eliminated. | No tools, delimiting, schema output, validators, and human review before any use. |
| R5 | Extension token theft from a compromised browser profile. | Hashed at rest, 30-day expiry, revocable, least-privilege scope (the same membership checks). |
| R6 | Store review (Chrome Web Store / Edge Add-ons). | Minimal permissions with written justifications, a privacy policy, icons (Phase 5). |
| R7 | Trademark: an app name containing "Reddit" is not allowed. | Neutral working name in one constant; the owner picks the final name. |
| R8 | Framework churn (Next 16, Prisma 7, Auth.js v5 beta). | Exact version pins; typecheck, lint, test, and build every phase. |
| R9 | The 48 h TTL removes context from old drafts. | Keep the draft (own text), source link, and feedback; only the captured Reddit text is purged. |

## 7. Phases

**Phase 1 — Audit and architecture.** This document plus `docs/compliance.md`. *Done 2026-09-29.*

**Phase 2 — Extension MVP + minimal shared backend.** *Done 2026-09-30.*
Next.js scaffold (pinned), Prisma schema/migration for the Phase 2 models, docker-compose Postgres, Auth.js credentials login, pilot-account CLI, extension pairing and sessions, `/api/ext/me`, draft generate / regenerate / edit / copy / feedback / delete APIs, Gemini + mock providers, shared validation, rate limits, audit, 48 h purge job, and the MV3 side panel (capture → review/remove → profile and tone → generate → edit / regenerate / copy / feedback).
- *Verified:* `npm run check` passes (typecheck, lint, 60 unit + DB tests, `next build`, extension build). An HTTP smoke test of 27 steps against `next start` covered login, the proxy, CSRF blocks, one-time token issue, drafting, re-validation, copy, feedback, regenerate, cron auth, and revocation. A browser smoke test of 18 steps loaded the built extension in Chromium, including the real dashboard login and code approval, at 400 px and 320 px panel widths.
- *Not verified:* the toolbar-icon and context-menu triggers (native browser UI; the smoke test injected the same stored capture instead); Microsoft Edge; live Gemini calls (no key configured — the Gemini adapter is unit-tested with a stubbed client).
- *Deviations:* the pairing approval uses an API route (testable over HTTP) rather than a server action. "Mention brand" became a checkbox so the panel fits 320 px.
- *Known issues:* npm flags ESLint 9.39.5 as unsupported (kept for `eslint-config-next` 16 compatibility). Vite prints a warning about a future config-loader default. Auth.js v5 is still a beta release. There is no profile editor yet: facts and voice are set in the database (Phase 3).

**Phase 3 — Dashboard foundation.**
Workspace and brand-profile management (CRUD, several profiles), members and invites, draft history (filter by profile or author; shows profile used; captured-text status) and feedback views, a connected-extensions list with revoke, analytics v1 (drafts generated, copied, feedback, active users), audit log view.

**Phase 4 — Intelligence dashboard.**
Watchlists (competitor / brand / keyword / topic), a monitoring-provider interface with per-provider status and method labels, conversation records from permitted sources only (user capture via extension "Save to workspace", manual import; Reddit Data API provider gated off with `identity read` scopes, reconciliation, and purge), review / classify / save / dismiss / open original, opportunities pipeline with notes, tags, and follow-up reminders.

**Phase 5 — Quality and release readiness.**
A tenant-isolation suite across every route, authn/authz tests, extension packaging (zip, icons) plus a permission guard, security headers/CSP, a deployment guide, a release checklist, and a privacy/retention document.

## 8. Test strategy

- **Unit:** shared validators, untrusted wrapper, prompt builder (injection fixtures), Gemini request shape (no tools), permissions matrix, tenant helper, pairing code/token helpers, audit redaction, extension capture/URL helpers, manifest guard (no content scripts, no host permissions beyond the API origin).
- **Database (real Postgres, `replyline_test`):** pairing lifecycle (token issued once; expiry, deny, revoke), `/api/ext/me` scoping, cross-tenant 404s for every draft route, role 403s, rate limit 429s, automatic revision path, style-memory isolation, the purge job.
- **Per phase:** `npm run typecheck && npm run lint && npm test && npm run build && npm run ext:build`.

## 9. External actions needed from the owner

1. Reddit: file the commercial (enterprise) access request before enabling any Data API feature; register the app; decide on Devvit later.
2. Google: a Gemini API key (paid tier) in `.env.local`.
3. Choose a final product name (R7).
4. Chrome Web Store / Edge Add-ons developer accounts, plus a privacy policy and terms (Phase 5).
