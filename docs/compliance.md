# Compliance notes — Reddit platform and data handling

Verified 2026-09-29 against the live sources below. **Re-verify before each release**: Reddit edits these pages often.
Nothing in this repository implies that Reddit has authorized commercial use.

## 1. What Reddit's current rules mean for this product

| Topic | Rule (source) | How the product complies |
|---|---|---|
| Data API access | "You must request access and get explicit approval before accessing any Reddit data through our API" ([Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564), created 2025-10-28, edited 2026-06-05) | No code path calls the Reddit API unless `REDDIT_DATA_API_APPROVAL_REF` is set (Phase 4 adapter; absent in Phase 2). |
| Commercial use | "any use of our services by a business or on behalf of a business or as part of a monetized product" needs permission and a contract ([Accessing Reddit Data](https://support.reddithelp.com/hc/en-us/articles/14945211791892), edited 2026-05-28; [Data API Terms](https://redditinc.com/policies/data-api-terms) §3.1, rev. 2026-07-20) | The pilot is private and unbilled. Billing and self-serve signup stay deferred until written approval. |
| Automated activity | No spam through automated posts, comments, or DMs, "including posting identical or substantially similar content across subreddits" (Responsible Builder Policy) | The product never posts. Users paste drafts manually. Drafts warn on repetition (Phase 3). |
| Commercialization / AI training | No selling, licensing, or commercializing Reddit data without written approval; no ML/AI training (Responsible Builder Policy; Data API Terms §2.4, §3.2; Developer Terms §4) | No training or fine-tuning on any content. "Feedback improves drafts" means prompt-time use of the workspace's **own** feedback and edited drafts only. |
| Sensitive inference | No deriving sensitive characteristics; no re-identification (Responsible Builder Policy) | Prompts never ask for author traits. Classifications (Phase 4) cover conversation intent only, never the person. |
| Deletion | Remove content deleted on Reddit; strip author identity for deleted accounts; "strongly recommend … deleting any stored user data and content within 48 hours" ([Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092), edited 2026-05-11) | Captured text is purged after `CAPTURED_TEXT_RETENTION_HOURS` (default 48) by `POST /api/jobs/purge-expired`. API-sourced records get reconciliation (Phase 4). |
| Modification / attribution | Don't modify User Content except for display formatting; attribute with link, username, and "from Reddit" (Data API Terms §2.4; [Developer Terms](https://redditinc.com/policies/developer-terms), rev. 2026-03-24) | Captured text is stored as the user provided it. Source links are shown alongside it. AI output is labeled "AI-assisted draft", separate from the source. |
| Rate limits | 100 QPM per OAuth client id, averaged over 10 min; honor `X-Ratelimit-*` (Data API Wiki) | Phase 4 client stops at the remaining-budget floor. It never parallelizes past the limit and never rotates clients. |
| Scopes | Verified in the live list at `https://www.reddit.com/api/v1/scopes` | Phase 4 requests only `identity read`. Never `submit`, `privatemessages`, `vote`, or `edit`. |
| Trademarks | App name must not contain "Reddit" without written consent (Data API Terms §4.1; Devvit Rules) | Working name "Replyline" lives in one constant (`shared/brand.ts`). |

## 2. Feature gating matrix

| Capability | Status | Why |
|---|---|---|
| Draft from text the user captures or pastes (extension/dashboard) | **Enabled** | No Reddit API access. Explicit user action. The user posts manually. |
| Reddit Data API monitoring of configured own posts | **Disabled — pending approval** | Needs Reddit's written commercial approval plus a registered OAuth app. |
| Reddit-wide search / discovery | **Not implemented** | Needs commercial approval for the discovery use case. Unrestricted search must not be assumed. |
| Posting, voting, DMs through the product | **Never** | Outside product scope, and prohibited as automated activity. |
| Devvit companion app | **Not built** | Only covers subreddits the customer moderates. Needs app review, fetch-domain approval, Gemini/OpenAI-only LLMs, no off-platform profiles, and SOC 2 Type II plus a pentest for account-linked services ([Devvit Rules](https://developers.reddit.com/docs/devvit_rules)). |

## 3. Browser-extension data handling

- Text leaves the page only when the user acts: context-menu "Draft a reply", clicking the toolbar icon while text is selected, or pasting. There are no content scripts, no reddit.com host permission, and no history or tab access.
- The side panel shows exactly what will be sent (text and optional source link) before **Generate**. The user can edit or remove either.
- The extension stores only its session token and preferences (`chrome.storage.local`) and the pending capture (`chrome.storage.session`, cleared when the browser closes). No API keys ship in the extension.

## 4. Open questions for Reddit and legal (before any paid launch)

1. Is processing Reddit text that a user copies into a commercial SaaS (no API) acceptable, and under what retention?
2. Which LLM providers are acceptable for Reddit-derived text under a Data API commercial agreement? (The Devvit list names Gemini and OpenAI.)
3. For own-post monitoring: acceptable retention window, reconciliation cadence, and whether classification labels count as derived data that must be deleted with the source.

## 5. Access-request summary (for the Reddit enterprise form)

> Replyline is a human-in-the-loop writing assistant for businesses. A signed-in team member selects a Reddit post or comment they are reading. The assistant drafts a reply in the business's declared voice, using only facts the business has verified. The person edits it and posts it manually from their own account. The product never posts, votes, or messages. We request read-only access (`identity read`) to monitor comments on posts the connected account authored. Content is kept at most 48 hours, deletions are honored via `/api/info` reconciliation, nothing is used for model training, and the product runs at well under 100 QPM.
