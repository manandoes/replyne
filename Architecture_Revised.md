# Architecture — Reddit Engagement & Customer Intelligence Platform
Version 2.0 | Multi-tenant, modular, human-in-the-loop

## Goals
Support comment management, permitted discovery, brand intelligence, contextual AI drafting, workspace feedback, and pipeline tracking. Start with private pilots and retain a path to subscription SaaS.

## Components
Customer UI → Authentication/Tenant Authorization → Workspace/Profile, Workflow/CRM, Analytics/Audit.
A narrow Reddit Adapter connects only to verified permitted APIs/Devvit capabilities. Event Intake validates and deduplicates events, applies eligibility/policy gates, then queues processing. Context Normalization feeds classifiers/summarizers/drafters. Validated drafts go to a Review Inbox. A separate user-action handler performs a supported public action only after explicit confirmation.

## Tenant model
Workspace is the isolation boundary. All profiles, connections, source items, drafts, opportunities, feedback, usage, and audit records carry workspace_id. Enforce authorization in service and repository layers, not just UI. Use least privilege and server-side secrets. Customer behavior is configuration-first; avoid code forks. Roles may include Owner, Admin, Member, Reviewer, Read-only.

## Services
- Workspace/Identity: membership, roles, settings, quotas, onboarding, disconnect.
- Reddit Adapter: current official APIs only; validate scopes, event support, rate limits, deletion signals, and commercial terms. No scraping, unofficial endpoints, or session imitation.
- Event Intake: schema validation, stable idempotency keys, backpressure, retries for safe processing only.
- Comment Service: minimum permitted content and configured-source association.
- Discovery Service: permitted sources, filters, evidence-backed relevance/intent, deduplication, opportunity lifecycle. If broad discovery is unavailable, do not scrape; document compliant alternatives.
- AI Orchestrator: provider abstraction, task-specific prompts, structured output validation, cost/timeout limits. No posting credentials/tools.
- Review/Action Service: exact text/account/destination preview, authenticated user and membership checks, explicit confirmation, one supported submission, recorded result. No auto-retry on uncertain public-action outcomes.
- Feedback: workspace-scoped preferences; no cross-tenant training without explicit opt-in.
- Audit/Analytics: minimal metadata; redact secrets and avoid unnecessary full-content logs.

## Logical data model
Workspace; Membership; BusinessProfile; RedditConnection (reference/scopes/status, no raw credentials in ordinary tables); MonitoredSource; SourceItem (minimal content, source refs, timestamps, deletion/expiry); Draft (generated/edited text, model/version/status); Opportunity (source refs, problem summary, evidence, relevance reasons, status, owner, notes); Feedback; AuditEvent; UsageRecord. Use schema validation, tenant-scoped queries, and documented retention.

## Draft pipeline
Eligibility → context minimization → mark Reddit text untrusted → load workspace voice/verified facts/exclusions → classify relevance/intent → draft specific helpful response → validate claims and remove fabricated first-person assertions/irrelevant promotion → duplicate similarity warning → save AI-assisted draft for human review. Natural language means clear and context-aware, not intentionally imperfect or designed to evade detection. Never promise “undetectable” or “ban-proof.”

## Security and abuse prevention
No AI tools or credentials capable of posting. Prompt injection cannot alter system policy or trigger actions. Validate outputs and inputs; apply secure sessions, access controls, secret handling, logging redaction, quotas, cooldowns, duplicate/repetition warnings, and community exclusions. Prohibit mass outreach, vote/follow automation, account farming, CAPTCHA/proxy/rate-limit evasion, ban evasion, and scraping restrictions bypass.

## Human action boundary
Event → classify → draft → review/edit → user clicks Reply → preview exact text/account/destination → explicit confirm → supported Reddit action once → record result. No scheduler, queue worker, webhook, or AI process may publish.

## Deletion and retention
Process supported deletion events promptly. Remove source content and dependent derived content as required; retain only permitted minimal tombstones. Apply expiry, customer deletion requests, and backup/analytics retention policies.

## Deployment and evolution
Pilot: tenant-aware application/database, queue, secret store, approved LLM, monitoring, controlled onboarding. Later: billing, self-serve signup, plan quotas, agency views, integrations, support tools—only after compliance and demand validation. Choose hosting compatible with selected Reddit/Devvit distribution; verify external data transfer and monetization permissions.

## Release checklist
Current terms/scopes/review/commercial permissions checked; capabilities verified; tenant isolation tested; AI cannot post; confirmation required; no evasion features; prompt injection, duplication, rate limits, deletion, and failures tested; privacy/retention/support docs complete.
