# UniboxAI Build Phases

## Current Phase
**Phase 10: Launch** — Up next

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

**Commit:** `feat: phase 1 complete - auth & multi-tenancy testing (16 vitest cases)`

### Phase 2: Dashboard Scaffold ✅
- [x] Basic Next.js app layout with Clerk auth + protected routes
- [x] `/dashboard` overview page (stats cards, recent messages, recent todos, AI activity)
- [x] `/dashboard/messages` — full inbox UI with working send box, AI to-do panel
- [x] `/dashboard/todos` — todo list with priority badges
- [x] `/dashboard/sessions` — session table + consent → QR connect flow
- [x] `/dashboard/team` — member table with roles
- [x] `/dashboard/settings` — org settings page
- [x] tRPC routers scaffolded (org, message, todo, session)
- [x] Middleware auth (Clerk redirect for protected routes)
- [ ] tRPC → DB live queries (blocked on DATABASE_URL)

**Note:** UI is complete with mock data. tRPC routers are wired — go live once DATABASE_URL is connected.

### Phase 3: WhatsApp Worker Foundation ✅
- [x] Postgres-backed auth store (replace LocalAuth in sessions.ts)
- [x] Message pipeline (listener → DB → Pusher event)
- [x] Rate limiter wired into send path (1 msg/sec, exponential backoff)
- [x] Session lifecycle: start, connect, disconnect, cleanup
- [x] Web → Worker command channel (Redis pub/sub)
- [x] Worker → Web webhook (POST /api/webhooks/worker)
- [x] `worker:sandbox` test mode
- [x] Health check endpoint (:3001)
- [x] Graceful degradation (CONNECTING sessions picked up on restart)

### Phase 4: AI Todo Detection ✅
- [x] Claude integration with Sonnet 4.6 (tool-choice forced, structured output)
- [x] Message batching (30s window, direction=OUTBOUND) — via existing BullMQ debounce
- [x] Cost guards (min 10 chars, not already processed) — existing gates + aiProcessed flag
- [x] Todo extraction prompt + structured output (`src/ai/prompts/extract-todo.ts`)
- [x] Store todos in DB, emit Pusher `private-{orgId}-todos` event
- [x] DetectionLog table for confidence < 0.7 detections (prompt tuning)

### Phase 5: Real-Time UI (Pusher) ✅
- [x] Pusher private channels setup (`app/lib/pusher-client.ts` singleton)
- [x] `/api/pusher/auth` endpoint (was already built in Phase 2)
- [x] `usePusherChannel` hook (`app/hooks/usePusherChannel.ts`)
- [x] Dashboard overview: live message + todo prepend via `private-{orgId}-{messages,todos}`
- [x] Messages page: live inbound/outbound messages, new conversation creation
- [x] Todos page: live todo prepend + client-side mark-done

### Phase 6: Billing (Stripe) — SKIPPED
- [ ] Org subscription model
- [ ] `/api/webhooks/stripe` for events
- [ ] Stripe portal link
- [ ] Message usage tracking + metering
- [ ] Paywall for free tier

### Phase 7: Settings & Session Management ✅
- [x] Consent screen wired to real tRPC create mutation + live QR via Pusher
- [x] Session list, status, disconnect (real tRPC mutations + Pusher live updates)
- [x] Org settings page: real updateOrg mutation
- [x] Team page: real listMembers + updateMemberRole + removeMember

### Phase 8: Monitoring & Hardening ✅
- [x] Sentry in web (@sentry/nextjs) and worker (@sentry/node)
- [x] Rate limiter with exponential backoff (BullMQ retry 2s→4s→8s)
- [x] Graceful degradation (CONNECTING sessions drained on restart)
- [ ] Rate limit response headers (deferred — no REST API, tRPC handles this differently)
- [ ] Logging strategy (console.log for now — structured logging deferred to Phase 9)

### Phase 9: Deployment ✅
- [x] `apps/whatsapp-worker/Dockerfile` — Node 20 + Chromium for Fly.io
- [x] `apps/whatsapp-worker/fly.toml` — health check, 1x shared CPU / 512MB
- [x] `vercel.json` — monorepo build + `prisma migrate deploy` pre-build
- [x] `.github/workflows/ci.yml` — typecheck + lint + test on every PR
- [x] `.env.example` — all required vars documented

### Phase 10: Launch 🚧
- [x] Landing page (`app/page.tsx` — hero, features, CTA)
- [x] Onboarding flow (`app/onboarding/page.tsx` — org name → session create → done)
- [ ] Docs (user-facing help / README)
- [ ] Go live (set env vars, run `pnpm db:migrate`, deploy to Vercel + Fly)
- **Blockers:** DATABASE_URL + UPSTASH_URL needed to activate live queries

---

## Notes
- Check `agent_docs/multi-tenancy.md` before adding any DB query
- Check `agent_docs/whatsapp-worker.md` before writing worker code
- `pnpm worker:sandbox` for testing worker without a real WA number
