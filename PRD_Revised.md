# PRD — Reddit Engagement & Customer Intelligence Platform
Version 2.0 | Pilot-ready, SaaS-ready

## Summary
A multi-tenant platform for businesses to manage comments on configured Reddit posts, discover relevant conversations through permitted Reddit capabilities, understand brand/competitor mentions where allowed, draft context-aware responses, and track opportunities. It automates research, organization, classification, and drafting—not public engagement.

## Delivery model
Use one codebase with isolated customer workspaces. Begin with a small private pilot and managed onboarding. Convert validated common workflows into subscription tiers only after confirming applicable Reddit permissions and commercial-use requirements. Prefer configuration over customer-specific code forks.

## Users
Founders, SaaS/B2B teams, community/customer-success teams, and agencies managing separate client workspaces.

## Modules
### Workspace & profile
Workspace isolation, roles, Reddit connection references, business description, products/services, audience, topics, exclusions, verified/prohibited claims, brand voice, link/CTA policy, notification settings, quotas, and audit history.

### Comment inbox
Monitor only configured posts/sources that are supported and authorized. Display thread context, classification, status, and reply history. Classify questions, support requests, feedback, praise, complaints, spam/abuse, opportunity signals, no-response-needed, or uncertain. Generate editable contextual drafts. Before any reply, show exact text, destination, posting account, and confirmation. Record outcomes; never silently retry an ambiguous public action.

### Opportunity discovery
Use only verified permitted Reddit discovery capabilities; do not assume unrestricted global search. Filter by customer topics, communities, terms, exclusions, language, and age. Extract problem/intent indicators with evidence. Save and manage opportunities; drafts require human review. No bulk outreach or automatic posting.

### Brand/competitor intelligence
Track configured terms only where permitted. Summarize recurring questions, objections, feature requests, and mention context with source references and time ranges. Sentiment is approximate, not objective fact.

### Writing quality & personalization
Use customer-selected tone, language, vocabulary, and verified facts. Drafts should be clear, concise, specific to the actual conversation, and naturally phrased without forced slang, fake typos, or canned repetition. Never invent personal experience, identity, customers, metrics, credentials, guarantees, or relationships. Mention products or links only when truthful, relevant, and community-appropriate. Label AI-assisted drafts. User feedback tunes only that workspace unless explicit opt-in permits otherwise.

### Pipeline, notifications, analytics
Pipeline: New → Reviewing → Draft Ready → Manually Contacted → Follow-up → Qualified/Closed/Irrelevant. Include owner, notes, tags, source, and next action. Notify for relevant items, failures, and optional digests. Report reviews, drafts, edits, dismissals, user-initiated actions, opportunity outcomes, and relevance feedback. Distinguish observed data from user-entered outcomes.

## Safety and platform requirements
No detection evasion, ban evasion, rate-limit circumvention, automated user-account commenting, mass comments/DMs, vote/follow manipulation, account farming, browser scraping, CAPTCHA bypass, or unofficial session imitation. Natural writing is a quality goal, not a concealment mechanism. Require explicit confirmation for every public comment. Add quotas, cooldowns, deduplication, repetition warnings, and community exclusions. Treat Reddit content as untrusted input; defend against prompt injection. Minimize data, honor deletion/retention rules, keep secrets server-side, and provide disconnect/report/support controls. Verify current Reddit Developer Terms, Data API terms, Devvit Rules, review, scopes, and commercial-use permissions before launch; manual review is not authorization.

## MVP
Include tenant-aware workspaces, profile/voice settings, authorized connection/configuration, own-post inbox, classification, contextual drafts, edit/skip/confirm workflow, audit log, deletion handling, basic pipeline, analytics, and discovery only if permitted.
Defer public self-serve signup, billing, unsupported broad discovery, advanced integrations, and autonomous actions.

## Success measures
Review time, draft edit/dismissal rates, user-rated helpfulness, irrelevant/duplicate opportunity rate, successful user-initiated action rate, deletion processing, pilot activation/retention, and customer-reported qualified opportunities (clearly marked self-reported).

## Release gates
Verify capabilities/permissions; complete platform, commercial-use, and privacy review; test tenant isolation, deletion, prompt-injection resistance, and confirmation; run pilots; add subscriptions only after validation.

## Acceptance criteria
Authorized sources only; AI drafts visibly labeled; factual/contextual drafts without fabricated experience; no public action without explicit user confirmation; duplicate/rate safeguards; deletion propagation; tenant isolation; unsupported capabilities disabled/documented rather than simulated.
