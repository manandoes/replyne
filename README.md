# Replyline

An AI drafting and intelligence assistant for teams that take part in Reddit conversations.
A **browser extension** drafts a reply to text you select; a **web dashboard** (in progress)
holds workspaces, brand profiles, draft history, and feedback. Both share one backend and
one account system.

**Product boundary:** Replyline never posts, votes, or messages on Reddit. You review and edit
every draft and post it yourself. Reddit API features stay disabled until Reddit grants written
commercial approval — see [docs/compliance.md](docs/compliance.md).
"Replyline" is a working name (Reddit's terms forbid "Reddit" in an app name).

Status and roadmap: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Repository layout

| Path | What |
|---|---|
| `app/`, `lib/`, `prisma/` | Next.js 16 app: dashboard pages and API routes, server logic, Postgres schema |
| `extension/` | Chrome/Edge MV3 extension (Vite + React), an npm workspace |
| `shared/` | API contracts, draft-validation rules, UI primitives, and theme tokens used by both |
| `scripts/` | Operator CLI (pilot onboarding) |
| `docs/` | Compliance notes |

## Local setup

Prerequisites: Node.js 24+, Docker Desktop.

```bash
npm install
cp .env.example .env.local        # set AUTH_SECRET and CRON_SECRET (openssl rand -base64 32)
npm run db:up                     # Postgres 17 on localhost:5433
npm run db:deploy                 # apply migrations
npm run pilot:create-account -- --email you@company.com --name "Your Name" \
  --workspace "Acme" --brand "Acme" --profile "Acme — support voice"
npm run dev                       # http://localhost:3000
```

The account command prints a generated password once. Signup is invite-only during the pilot.
Until profile editing ships in the dashboard, add verified facts and voice directly in the
database (`npm run db:studio` → BrandProfile). Drafts rely only on those facts.

**AI provider.** Set `GEMINI_API_KEY` (paid tier recommended, so prompts aren't used for training).
Without a key, development uses a deterministic mock, and every mock draft is labeled "Mock AI".
Production refuses to draft until a provider is configured.

## Browser extension

```bash
npm run ext:build                 # or: npm run ext:dev (rebuilds on change)
```

1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, and choose
   **Load unpacked** → `extension/dist`.
2. Click the Replyline toolbar icon → **Connect**. A dashboard tab opens. Sign in, type the code
   shown in the side panel, and approve.
3. On any page, select a post or comment, then click the toolbar icon or right-click →
   **Draft a reply with Replyline**. Or paste text into the side panel.
4. Review what will be sent, pick a brand profile and tone, and click **Generate response**.
   Edit, regenerate, rate, and **Copy reply**, then paste it into Reddit yourself.

The API origin is baked in at build time (`extension/.env`: `VITE_API_BASE_URL`, default
`http://localhost:3000`), and the manifest's only host permission is derived from it. The
extension has no content scripts and never reads a page unless you invoke it.

## Scheduled job

Captured Reddit text is deleted after `CAPTURED_TEXT_RETENTION_HOURS` (default 48). Run the
sweep at least hourly from any scheduler:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/jobs/purge-expired
```

## Checks

```bash
npm test          # unit + database tests (needs `npm run db:up`; uses the replyline_test database)
npm run check     # typecheck, lint, tests, Next.js build, extension build
```

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public base URL (extension connect link, same-origin checks) |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | Auth.js session signing |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Drafting provider (`gemini` or `mock`) |
| `CAPTURED_TEXT_RETENTION_HOURS` | Retention for user-captured Reddit text |
| `CRON_SECRET` | Bearer secret for `/api/jobs/*` |
| `REDDIT_DATA_API_APPROVAL_REF` | Leave empty. Reserved for the gated Reddit integration (Phase 4). |
