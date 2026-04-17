# UniboxAI Build Phases

## Current Phase
**Phase 0: Foundation** — Scaffold monorepo, Prisma schema, core types

## Phases

### Phase 0: Foundation
- [ ] Monorepo structure (apps/, packages/, pnpm-workspace.yaml, root package.json)
- [ ] `packages/database`: Prisma schema with multi-tenant safety
- [ ] `packages/shared`: Zod schemas for messages, todos, orgs
- [ ] git init, .gitignore
- [ ] Verify typecheck + test commands work
- **Blockers:** None

### Phase 1: Authentication & Multi-Tenancy
- [ ] Clerk webhook at `apps/web/app/api/webhooks/clerk/route.ts`
- [ ] User sync from Clerk → Postgres
- [ ] Role system (OWNER/MANAGER/EMPLOYEE + row-level queries)
- [ ] Protected tRPC middleware for orgId enforcement
- [ ] Verify multi-tenancy rules in all queries
- **Blockers:** Phase 0

### Phase 2: Dashboard Scaffold
- [ ] Basic Next.js app layout with Clerk auth
- [ ] `/dashboard` main page (org stats, recent messages)
- [ ] tRPC routers for org/user/message queries
- [ ] Shadcn components (Button, Card, Input, Dialog, DataTable)
- **Blockers:** Phase 1

### Phase 3: WhatsApp Worker Foundation
- [ ] Postgres-backed auth store
- [ ] Message pipeline (listener → DB → event)
- [ ] Rate limiter (1 msg/sec, exponential backoff)
- [ ] Session lifecycle (start, connect, disconnect, cleanup)
- [ ] `worker:sandbox` test mode
- **Blockers:** Phase 0 (database)

### Phase 4: AI Todo Detection
- [ ] Claude integration with Sonnet 4.6
- [ ] Message batching (30s window, direction=OUTBOUND)
- [ ] Cost guards (min 10 chars, not already processed)
- [ ] Todo extraction prompt
- [ ] Store todos in DB, emit Pusher events to dashboard
- **Blockers:** Phase 3 + API key

### Phase 5: Real-Time UI (Pusher)
- [ ] Pusher private channels setup
- [ ] `/api/pusher/auth` endpoint
- [ ] Dashboard message stream + real-time updates
- [ ] Todo notifications on client
- **Blockers:** Phase 2

### Phase 6: Billing (Stripe)
- [ ] Org subscription model
- [ ] `/api/webhooks/stripe` for events
- [ ] Stripe portal link
- [ ] Message usage tracking + metering
- [ ] Paywall for free tier
- **Blockers:** Phase 2

### Phase 7: Settings & Session Management
- [ ] Consent screen for new WA sessions
- [ ] Session list, status, disconnect
- [ ] Org/member management UI
- [ ] tRPC mutations for all
- **Blockers:** Phase 2 + Phase 3

### Phase 8: Monitoring & Hardening
- [ ] Sentry error tracking
- [ ] Logging strategy
- [ ] Rate limit response headers
- [ ] Retry logic for message sends
- [ ] Graceful degradation
- **Blockers:** Phase 4+

### Phase 9: Deployment
- [ ] Vercel (web), Fly.io (worker)
- [ ] Environment setup (secrets, Redis, DB)
- [ ] CI/CD (typecheck, lint, test on PR)
- [ ] Database migrations in prod
- **Blockers:** Phase 8

### Phase 10: Launch
- [ ] Landing page
- [ ] Onboarding flow
- [ ] Docs
- [ ] Go live
- **Blockers:** Phase 9

---

## Notes
- Verify `pnpm typecheck && pnpm test` before Phase 1
- Check `agent_docs/multi-tenancy.md` before adding any DB query
- Check `agent_docs/whatsapp-worker.md` before writing worker code
