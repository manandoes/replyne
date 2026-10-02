# Replyline — Deployment & Release Guide

## Overview

Replyline is a browser extension (Chrome/Edge MV3) paired with a Next.js SaaS dashboard. The product never posts, votes, or messages on Reddit — users review and post manually.

## Stack

- **Frontend**: Next.js 16.3.7 (App Router), React 19.2.8, Tailwind CSS v4
- **Extension**: Vite 8.3.1 + React, Chrome MV3 manifest
- **Database**: PostgreSQL 17 via Docker (host port 5433)
- **ORM**: Prisma 7.10.0 with `@prisma/adapter-pg`
- **Auth**: Auth.js v5.0.0-beta.32 (credentials provider)
- **Validation**: Zod 4.6.5
- **Testing**: Vitest 5.0.2 (real Postgres), Playwright Core for UI smoke tests

## Environment Variables

Copy `.env.example` to `.env.local` and set:

```
DATABASE_URL=postgresql://replyline:replyline@localhost:5433/replyline
NEXTAUTH_SECRET=<32-char-random-string>
NEXTAUTH_URL=http://localhost:3000
APP_URL=http://localhost:3000
CAPTURED_TEXT_RETENTION_HOURS=48
AI_PROVIDER=mock          # gemini when you have a key
GEMINI_API_KEY=           # optional; mock provider used when absent
REDDIT_DATA_API_APPROVAL_REF=   # REQUIRED before any Reddit Data API features work
CRON_SECRET=<random-string>     # for /api/jobs/purge-expired
```

## Docker

```bash
npm run db:up       # Start Postgres (host port 5433)
npm run db:down     # Stop (data persists in named volume)
npm run db:deploy   # Apply migrations (production)
npm run db:migrate  # Apply + generate seed (development)
npm run db:generate # Regenerate Prisma client
npm run db:studio   # Open Prisma Studio
```

## Development

```bash
npm run dev         # Next.js dev server
npm run ext:dev     # Extension dev (Vite HMR)
npm test            # Run all tests
npm run typecheck   # TypeScript + extension typecheck
npm run lint        # ESLint
npm run format      # Prettier format
```

## Production Build

```bash
npm run build       # Next.js production build
npm run ext:build   # Extension production build (dist/ in extension/)
npm start           # Run production server
```

## Chrome Web Store / Edge Add-ons

### Packaging

```bash
npm run ext:build
```

The build outputs to `extension/dist/`. Create a ZIP:

```bash
cd extension/dist
zip -r ../replyline-extension.zip .
```

### Manifest Checks

The extension uses MV3 with:
- `side_panel` for the drafting UI
- `context_menus` for "Draft a reply" on selected text
- `declarativeContent` for toolbar icon state
- `offscreen` document for clipboard access

Before submitting:
1. Ensure `manifest.json` has correct `permissions` and `host_permissions`
2. Remove any dev-only `chrome.developerUpload` calls
3. Verify content security policy allows your dashboard origin

### Edge Add-ons

Same package as Chrome. Submit to [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons).

## Reddit API Compliance

**Critical**: All Reddit Data API features are gated behind `REDDIT_DATA_API_APPROVAL_REF`. The product:

- Never posts, votes, or messages on Reddit
- Users capture text manually via the extension or paste it
- Captured text is purged after the configured TTL (default 48h)
- No Reddit branding in the product name (Replyline, not "RedditReply")
- No detection evasion language in drafts (validated client + server-side)

Before enabling Reddit Data API access:
1. Obtain written commercial approval from Reddit
2. Set `REDDIT_DATA_API_APPROVAL_REF` to the reference number
3. Update `lib/data-api/` provider implementation
4. Request only `identity read` scope — no submission scopes

## Security Checklist

- [x] Tenant isolation: all queries scoped via `scopedWhere()`
- [x] CSRF defense: same-origin check on session-authenticated writes
- [x] Rate limiting: Postgres-backed fixed-window counters
- [x] Audit logging: metadata only, no Reddit text or draft content
- [x] Input validation: Zod schemas on all API routes
- [x] Prompt injection defense: untrusted text fenced with XML tags
- [x] Password timing protection: dummy hash for non-existent users
- [x] Extension auth: device-code pairing (RFC 8628 style), no passwords stored
- [x] Data retention: automatic purge of captured text after TTL
- [x] Role-based access: 4 roles (OWNER/ADMIN/MEMBER/VIEWER) with permission matrix

## Test Coverage

106 tests across 18 test files:
- **Shared validators**: link policy, prohibited claims, evasion language
- **AI**: prompt injection resistance, Gemini adapter
- **APIs**: drafts, profiles, workspaces, account, extension pairing
- **Dashboard data**: analytics queries, draft filtering
- **Intelligence**: watchlists, conversations, opportunities (Phase 4)
- **Tenant isolation**: cross-workspace access denied for all resources

## Monitoring

The audit log captures key actions without storing content:
- Draft generation, editing, copying, deletion
- Profile creation/update/archival
- Workspace changes, member invites/role changes
- Watchlist/conversation/opportunity lifecycle
- Extension pairing approvals
- Retention purges

## Known Limitations

1. **Flaky test**: Account password change test occasionally times out (5s default). This is a pre-existing issue unrelated to Phase 5.
2. **Analytics query**: Uses `LEFT JOIN LATERAL` — acceptable at current scale but monitor at 10k+ drafts.
3. **Mobile nav**: Sidebar collapses to top bar on mobile — functional but could use polish.
4. **No automated posting**: By design — users must review and post manually.

## Phase Status

| Phase | Status |
|-------|--------|
| 1. Audit/Architecture | ✅ Complete |
| 2. Extension MVP | ✅ Complete |
| 3. Dashboard Foundation | ✅ Complete |
| 4. Intelligence Dashboard | ✅ Complete |
| 5. Quality/Release | ✅ Complete |

All phases complete. Product ready for pilot deployment.
