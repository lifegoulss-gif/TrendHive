# UniboxAI — Phase 0 Complete

## What's built:

### Phase 0: Foundation ✅
- [x] Monorepo structure (pnpm workspace)
- [x] Prisma schema with multi-tenant safety
- [x] Zod schemas for all types
- [x] Core documentation (architecture, database, auth, testing, deployment)
- [x] Next.js app with Clerk auth
- [x] tRPC setup with protected procedures
- [x] Core routers (org, message, todo, session)
- [x] Clerk webhook for user sync
- [x] WhatsApp worker foundation
- [x] Rate limiter + session manager
- [x] BullMQ job queue setup

### Next phases:

**Phase 1: Authentication & Multi-Tenancy**
- Verify all routers enforce orgId
- Test multi-tenant isolation

**Phase 2: Dashboard Scaffold**
- Message feed component
- Session list + connect flow
- Todo tracker UI

**Phase 3: WhatsApp Worker Full**
- Message listener
- Send flow with rate limiting
- Sandbox testing mode

**Phase 4: AI Todo Detection**
- Claude integration
- Todo extraction + batching
- Cost guards

**Phase 5+:** Real-time (Pusher), Billing (Stripe), Deployment

---

## Running locally:

```bash
# Install dependencies
pnpm install

# Set up .env.local (copy .env.example)
cp .env.example .env.local

# Sync Prisma schema to DB
pnpm db:push

# Run web + worker
pnpm dev

# Web:
http://localhost:3000

# Worker in separate terminal:
pnpm dev:worker
```

## Git:

All changes committed to `main`. Next session: pick a phase.
