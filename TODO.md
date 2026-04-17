# UniboxAI Build Phases

## Current Phase
**Phase 2: Dashboard Scaffold** — Next

## Phases

### Phase 0: Foundation ✅
- [x] Monorepo structure (apps/, packages/, pnpm-workspace.yaml, root package.json)
- [x] `packages/database`: Prisma schema with multi-tenant safety
- [x] `packages/shared`: Zod schemas for messages, todos, orgs
- [x] git init, .gitignore
- [x] Verify typecheck + test commands work

### Phase 1: Authentication & Multi-Tenancy ✅
- [x] vitest + test infrastructure setup (database + web)
- [x] Multi-tenancy isolation tests (orgs cannot leak data)
- [x] Clerk webhook sync tests (user.created, user.deleted)
- [x] tRPC auth middleware tests
- [x] Role-based access control tests
- [x] Run full test suite locally (16 tests: 8 database + 8 web)
- [x] All tests passing (100%)

**Results:**
- 2 test files in packages/database (multi-tenancy, clerk-webhook)
- 1 test file in apps/web (auth & RBAC)
- 16 total test cases covering:
  - Multi-tenancy isolation (5 tests)
  - Clerk webhook sync (3 tests)
  - tRPC auth middleware (3 tests)
  - Role-based access control (4 tests)
  - Cross-org access prevention (1 test)

**Commit:** `feat: phase 1 complete - auth & multi-tenancy testing (16 vitest cases)`

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
