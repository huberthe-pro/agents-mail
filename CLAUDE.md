# Agents Mail API

Email service backend for AI Agents — API/CLI for machines, Admin panel for operators.

- Website: https://agentsmail.org
- Founder: Anson Ho (http://anson.im)
- CoFounder: Claude Code & Codex & OpenClaw

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API Backend | Cloudflare Workers + D1 (SQLite) |
| Email Sending | Resend API |
| Email Receiving | Cloudflare Email Routing |
| CLI | Commander.js + TypeScript |
| Admin Panel | Static HTML + Vanilla JS (Zero Trust protected) |
| Testing | Vitest |
| CI/CD | GitHub Actions |

## Directory Structure

```
src/               Workers API source (handlers/, middleware/)
migrations/        D1 database migrations (001-014)
admin/             Admin dashboard (static HTML, proxied via Workers /admin/)
cli/               CLI tool for AI agents
sdk/               TypeScript SDK (`agentsmail` npm package)
tests/             Integration tests
docs/              Technical documentation
```

## Development Commands

```bash
# API development
npm run dev              # Local dev server (wrangler)
npm test                 # Unit tests
npm run db:migrate       # Apply D1 migrations

# CLI
cd cli && npm install && npm run build    # Build CLI
cd cli && npm test                        # CLI unit tests

# Integration tests
npm run test:integration    # Requires live API
```

## Key Architecture Decisions

1. **Dual auth model** — API Key auth for agents (CLI/API), Magic Link + JWT for humans (Web Dashboard).
2. **D1 parameterized queries** — Always use `?` placeholders, never string interpolation (SQL injection prevention).
3. **Admin via Workers proxy** — Admin panel is proxied through Workers at `/admin/` path.

## Code Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`)
- **Language**: TypeScript for all source files
- **Formatting**: 2 spaces, UTF-8, LF line endings
- **API responses**: JSON with `{ success, data?, error?, message? }` envelope

## Important File Paths

| File | Purpose |
|------|---------|
| `src/router.ts` | API route definitions |
| `src/handlers/` | Request handlers by domain |
| `src/middleware/` | Auth, CORS, validation middleware |
| `src/types.ts` | Env bindings and shared types |
| `wrangler.toml` | Workers deployment config |
| `migrations/` | D1 schema migrations (001-014) |
| `cli/src/index.ts` | CLI entry point |
| `sdk/src/client.ts` | TypeScript SDK client |

## Database Migrations

20 migrations in `migrations/`: agents, emails, ACL, contacts, API keys, webhooks, user auth, admin audit, rate limits, contact direction, trust tiers, agent description, key rotation, email events, audit actor type, email encryption, acknowledge destroy, registration fingerprint, agent last activity, name bound at.

Apply with: `npm run db:migrate`

## Current Version

v0.2.2
