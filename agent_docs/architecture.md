# Architecture Overview

This is a multi-tenant SaaS operating across three services: the web dashboard, a background worker, and a shared database. Real-time communication uses Pusher; billing via Stripe; AI extraction via Claude.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browsers / Clients                        │
└──────┬──────────────────────────────────────────────────────────┘
       │ HTTPS
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   apps/web (Next.js on Vercel)                  │
├──────────────────────────────────────────────────────────────────┤
│ - Landing / auth pages (Clerk)                                   │
│ - Dashboard (message feed, org stats, todo tracker)              │
│ - Settings (sessions, members, billing)                          │
│                                                                   │
│ tRPC Routers (TRPC_ORIGIN, protected middleware):                │
│  └─ org, message, todo, session, subscription routers            │
│                                                                   │
│ REST Webhooks (app/api/):                                        │
│  └─ /webhooks/clerk                                              │
│  └─ /webhooks/stripe                                             │
│  └─ /webhooks/whatsapp (worker callbacks)                        │
│  └─ /api/pusher/auth (Pusher private channels)                   │
└──────┬──────────────────────────────────────────────────────────┘
       │
       ├─────────────────────┬──────────────────────┬──────────────────┐
       │                     │                      │                  │
       ▼                     ▼                      ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ Clerk API        │  │ Stripe API   │  │ Claude API   │
│ (Supabase)   │  │ (Identity mgmt)  │  │ (Billing)    │  │ (AI todos)   │
│              │  │                  │  │              │  │              │
│ Tables:      │  │ - User creation  │  │ - Charges    │  │ - Sonnet 4.6 │
│ - Org        │  │ - Email/password │  │ - Subscriptions
│ - User       │  │ - Sessions       │  │ - Webhooks   │  │ - Batch msgs │
│ - Session    │  │                  │  │              │  │              │
│ - Message    │  └──────────────────┘  └──────────────┘  └──────────────┘
│ - Todo       │
│ - Subscription
│              │
└──────┬───────┘
       │
       ├─────────────┬──────────────────────┬──────────────┐
       │             │                      │              │
       ▼             ▼                      ▼              ▼
    ┌────────────────────────┐   ┌─────────────────┐   ┌──────────┐
    │ BullMQ + Upstash Redis │   │ Pusher (Events) │   │ Resend   │
    │                        │   │                 │   │ (Email)  │
    │ Job Queue:             │   │ Channels:       │   │          │
    │ - messageProcessing    │   │ - org:{orgId}   │   │ Invites, │
    │ - todoExtraction       │   │ - session:{id}  │   │ alerts   │
    │ - sendMessage          │   │                 │   │          │
    └────┬───────────────────┘   └─────────────────┘   └──────────┘
         │
         │ dequeue jobs
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│        apps/whatsapp-worker (Node on Fly.io / Railway)           │
├──────────────────────────────────────────────────────────────────┤
│ - whatsapp-web.js client (Chromium)                              │
│ - Message listener (from WA→DB→queue)                            │
│ - Job consumer (send message, extract todos)                     │
│ - Session manager (Postgres-backed auth)                         │
│ - Rate limiter (1 msg/sec, exponential backoff)                  │
│                                                                   │
│ Persistence:                                                      │
│ - session authData (Postgres LocalAuth store)                    │
│ - message logs (Postgres)                                        │
│ - crashed sessions alerting (Sentry)                             │
└──────────────────────────────────────────────────────────────────┘
```

## Request Flow: User Sends Message to Customer

1. **Employee writes message** in dashboard
2. **POST /trpc/message.send** (web app)
   - Validate orgId + permission + message length
   - Create Message record (direction=OUTBOUND)
   - Enqueue **sendMessage** job to Redis
3. **Worker dequeues sendMessage job**
   - Fetch session by ID
   - Rate limit check (1 msg/sec)
   - Send via WA (whatsapp-web.js)
   - Update Message.wamId + timestamp
   - Emit Pusher event `message:created` to clients
4. **Dashboard clients** subscribed to org:orgId receive event → UI updates

## Request Flow: Customer Sends Message to Employee

1. **WhatsApp message arrives** on session
2. **Worker listener receives event**
   - Parse from, to, text, timestamp, wamId
   - Create Message record (direction=INBOUND)
   - Emit job **messageProcessing** to queue
3. **Worker processes message** (async)
   - Check message length ≥ 10 chars
   - Check aiProcessed = false
   - Batch with other OUTBOUND messages from last 30s
   - Call Claude API to extract todos
   - Create Todo records for each extracted task
   - Update Message.aiProcessed = true
   - Emit Pusher event `todo:created` to clients
4. **Dashboard clients** receive event → real-time todo update

## Data Flow: Multi-Tenancy Enforcement

Every query must filter by `orgId`:

```typescript
// ❌ WRONG - data leak
const messages = await prisma.message.findMany();

// ✅ CORRECT
const messages = await prisma.message.findMany({
  where: { orgId: user.orgId },
});
```

The **tRPC middleware** enforces this:

```typescript
const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user?.orgId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, orgId: ctx.user.orgId } });
});
```

All queries use `protectedProcedure`, so `ctx.orgId` is always available and validated.

## Service Boundaries

| Service | Owner | Reads | Writes | Public? |
|---------|-------|-------|--------|---------|
| Web (Next.js) | Vercel | Postgres, Clerk, Stripe | Postgres, Redis queue | HTTPS |
| Worker (Node) | Fly.io | Postgres, Redis queue | Postgres, WhatsApp | NO |
| Database (PG) | Supabase | - | Web + Worker | NO |
| Clerk | External | - | - | API |
| Stripe | External | - | - | API |
| Claude | External | - | - | API |

**Communication:**
- Web ↔ Worker: async via Redis queue + Pusher events
- Web ↔ Postgres: direct (internal network)
- Worker ↔ Postgres: direct (internal network)
- Web/Worker ↔ Clerk/Stripe/Claude: HTTPS API calls

## Session Lifecycle

1. **User clicks "Connect WhatsApp"** in dashboard
2. **Consent screen renders** (legal requirement)
3. **POST /trpc/session.connect** creates WhatsAppSession record
4. **Worker picks up signal** to initialize session
5. **QR code rendered** on dashboard (via Pusher)
6. **User scans on phone**
7. **Session status → CONNECTED**
8. **Message listener boots**
9. **Incoming messages** now processed
10. **User clicks "Disconnect"**
11. **Session status → DISCONNECTED**
12. **QR code cleared**

Session data is persisted in Postgres using `LocalAuth` strategy to survive ephemeral restarts.

## Error Handling & Resilience

- **Message send fails** → exponential backoff, retry up to 3x
- **Session connection fails** → error logged, Sentry alert, UI shows error
- **AI extraction timeout** → message marked but todo not created, retryable
- **Webhook signature invalid** → reject, log, alert
- **Database connection lost** → queue stalls, worker pauses, health check fails
- **Rate limit exceeded** → queue job, backoff, try again later

## Security Notes

1. **Multi-tenancy**: orgId validated on every tRPC call
2. **Authentication**: Clerk handles identity; Postgres User table is source of truth
3. **Authorization**: row-level filtering by (orgId + role)
4. **API keys**: never logged, live in env only
5. **Session data**: persisted encrypted in Postgres by Supabase
6. **Message content**: not logged; Sentry has scrubber rules
7. **Rate limiting**: per-session quota in Redis + DB backup

---

## See Also

- [database.md](database.md) — schema details, indexes, migrations
- [whatsapp-worker.md](whatsapp-worker.md) — worker specifics, message pipeline
- [ai-todo-detection.md](ai-todo-detection.md) — Claude integration, cost control
- [auth-and-roles.md](auth-and-roles.md) — Clerk sync, RBAC patterns
- [multi-tenancy.md](multi-tenancy.md) — orgId enforcement checklist
