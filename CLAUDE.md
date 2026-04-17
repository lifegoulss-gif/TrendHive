# UniboxAI — WhatsApp Employee Monitor SaaS

Multi-tenant SaaS for businesses to unify employee WhatsApp inboxes, auto-extract to-dos from chats with Claude, and track team performance.

**Status:** Early-stage solo-dev build. Ship fast, iterate with real users.

---

## Stack (locked)

Next.js 15 App Router · TypeScript · Tailwind + shadcn/ui · tRPC · Prisma · PostgreSQL (Supabase) · Clerk · BullMQ + Upstash Redis · Pusher · whatsapp-web.js · Claude API (`claude-sonnet-4-6`) · Stripe · Resend · Sentry.

---

## Monorepo map

```
apps/web              — Next.js dashboard, landing, tRPC API, webhooks
apps/whatsapp-worker  — long-running Node service, whatsapp-web.js sessions
packages/database     — single Prisma schema + generated client
packages/shared       — Zod schemas & types shared between apps
```

**Never** regenerate Prisma inside an app. Always import the client from `@repo/database`.

---

## Commands

```bash
pnpm dev              # run web + worker in parallel
pnpm dev:web          # web only
pnpm dev:worker       # worker only (needs Redis running)
pnpm db:push          # sync Prisma schema → DB (dev)
pnpm db:migrate       # create migration (prod)
pnpm db:studio        # Prisma Studio
pnpm typecheck        # across all workspaces
pnpm lint             # Biome
pnpm test             # vitest
pnpm worker:sandbox   # spin up a throwaway WA session for testing — DO NOT use a real number
```

Before finishing any task: `pnpm typecheck && pnpm test`. Run single tests during work, not the whole suite.

---

## Non-negotiable rules (YOU MUST follow these)

1. **Multi-tenancy:** Every Prisma query MUST filter by `orgId`. Missing an `orgId` filter is a data leak between customers. There are no exceptions. When in doubt, check `agent_docs/multi-tenancy.md`.

2. **Clerk is not the user store.** Query the Postgres `User` table, never Clerk's API from components. The Clerk webhook at `apps/web/app/api/webhooks/clerk/route.ts` keeps them synced.

3. **WhatsApp session persistence:** The worker runs on ephemeral filesystems (Fly/Railway). `LocalAuth` breaks on restart. Use the Postgres-backed auth strategy in `apps/whatsapp-worker/src/sessions/auth-store.ts`. See `agent_docs/whatsapp-worker.md`.

4. **Outbound rate limiting:** Max 1 message/second per WA session, exponential backoff on send errors. Getting numbers banned kills the business. The limiter lives in `apps/whatsapp-worker/src/sessions/rate-limiter.ts`.

5. **AI cost control:** Before calling Claude on a message, check: length ≥ 10 chars, direction = OUTBOUND (employee), not already `aiProcessed`. Batch per conversation every 30s, not per-message. See `agent_docs/ai-todo-detection.md`.

6. **Consent flow:** Any code path that connects a new WA session MUST render the consent screen first (`apps/web/app/(dashboard)/settings/sessions/consent.tsx`). This is a legal requirement, not a UX preference.

7. **shadcn/ui only:** Add components via `pnpm dlx shadcn@latest add <name>`. Never hand-write primitive UI components — they already exist.

8. **tRPC for all app APIs.** REST routes in `app/api/` are reserved for webhooks (Clerk, Stripe, WhatsApp worker callbacks).

---

## Reading order for new tasks

Before implementing, read only the docs relevant to the task. Don't read all of them.

- `agent_docs/architecture.md` — system overview, how web ↔ worker ↔ DB talk
- `agent_docs/database.md` — Prisma schema rationale, indexes, migration workflow
- `agent_docs/whatsapp-worker.md` — session lifecycle, message pipeline, gotchas
- `agent_docs/ai-todo-detection.md` — the Claude prompt, batching logic, cost math
- `agent_docs/multi-tenancy.md` — orgId enforcement patterns, row-level-security
- `agent_docs/auth-and-roles.md` — Clerk↔Postgres sync, OWNER/MANAGER/EMPLOYEE permissions
- `agent_docs/testing.md` — what to test, what not to test, mocking WhatsApp
- `agent_docs/deployment.md` — Vercel (web), Fly.io (worker), env vars, secrets

---

## Workflow expectations

- For anything touching the worker, DB schema, or billing: use Plan Mode first. Ask me to approve the plan before you write code.
- For trivial changes (copy, styling, single-file bugfix): just do it, no plan.
- After two failed attempts at the same fix, stop and ask. Don't spiral.
- Commit per logical unit, not per file and not per session. Conventional commits format.
- Never commit `.env*`, session data, or customer message content to git.

---

## Current focus

See `@TODO.md` for the active phase. Update it when a phase completes.

---

## Gotchas I've hit (don't repeat)

- `whatsapp-web.js` silently drops messages if the listener is registered after `client.initialize()`. Listeners first, then init.
- Prisma transactions timeout at 5s default — message-processing jobs need `{ timeout: 15000 }`.
- Clerk webhook signatures fail if body is parsed before verification. Use raw body.
- Pusher private channels need auth endpoint at `/api/pusher/auth`, not the default.
- Vercel Edge runtime doesn't support `whatsapp-web.js` — keep worker code out of the web app.
