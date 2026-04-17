# Deployment

Multi-service deployment: web on Vercel, worker on Fly.io, database on Supabase.

## Environment Setup

### Supabase (PostgreSQL)

1. Sign up at [supabase.com](https://supabase.com)
2. Create project (region: closest to your users)
3. Copy connection string → `.env.local` as **DATABASE_URL**
   ```
   postgresql://user:password@host:5432/postgres?schema=public
   ```
4. Enable **Row Level Security** (optional, not required yet)

### Clerk (Authentication)

1. Sign up at [clerk.com](https://clerk.com)
2. Create application
3. Copy **Publishable Key** → `.env.local` as **NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY**
4. Copy **Secret Key** → `.env.local` as **CLERK_SECRET_KEY**
5. Webhook secret → **CLERK_WEBHOOK_SECRET**
   - In Clerk dashboard, Webhooks → Create → `user.created` + `user.deleted`
   - Point to `https://yourdomain.com/api/webhooks/clerk`
   - Copy signing secret

### Stripe (Billing)

1. Sign up at [stripe.com](https://stripe.com)
2. Copy **Publishable Key** → **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**
3. Copy **Secret Key** → **STRIPE_SECRET_KEY**
4. Create webhook endpoint → `https://yourdomain.com/api/webhooks/stripe`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `charge.succeeded`
   - Copy signing secret → **STRIPE_WEBHOOK_SECRET**

### Upstash Redis (Job Queue)

1. Sign up at [upstash.com](https://upstash.com)
2. Create Redis database
3. Copy **REST URL** → **UPSTASH_URL**
4. Copy **REST Token** → **UPSTASH_TOKEN**

### Pusher (Real-Time Events)

1. Sign up at [pusher.com](https://pusher.com)
2. Create channel
3. Copy app ID, key, secret
   - **NEXT_PUBLIC_PUSHER_KEY** (public)
   - **PUSHER_ID**, **PUSHER_SECRET** (backend)

### Claude API

1. Get API key from [console.anthropic.com](https://console.anthropic.com)
2. Copy → **ANTHROPIC_API_KEY**

### Resend (Email)

1. Sign up at [resend.com](https://resend.com) (optional, for invites)
2. Copy API key → **RESEND_API_KEY**

### Sentry (Error Tracking)

1. Sign up at [sentry.io](https://sentry.io)
2. Create projects for web + worker
3. Copy DSN for each → **SENTRY_DSN_WEB**, **SENTRY_DSN_WORKER**

## Environment Variables

Create `.env.local` in project root:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis / BullMQ
UPSTASH_URL=https://...
UPSTASH_TOKEN=...

# Pusher
NEXT_PUBLIC_PUSHER_KEY=...
PUSHER_ID=...
PUSHER_SECRET=...
PUSHER_CLUSTER=mt1

# Claude / AI
ANTHROPIC_API_KEY=sk-ant-...

# Resend
RESEND_API_KEY=re_...

# Sentry
SENTRY_DSN_WEB=https://...
SENTRY_DSN_WORKER=https://...

# App URLs
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=... # run: openssl rand -base64 32

# WhatsApp Worker
OTEL_EXPORTER_OTLP_ENDPOINT=... # if using observability
```

## Vercel (Web App)

### Build & Deployment

1. Install [Vercel CLI](https://vercel.com/cli)
   ```bash
   npm i -g vercel
   ```

2. Connect git repo
   ```bash
   vercel link
   ```

3. Set environment variables in Vercel dashboard:
   - Project Settings → Environment Variables
   - Paste all `.env.local` values

4. Deploy
   ```bash
   vercel deploy --prod
   ```

### Build Configuration

Vercel auto-detects `package.json` in root and runs:
```json
{
  "scripts": {
    "build": "pnpm build",
    "start": "pnpm --filter @repo/web start"
  }
}
```

### Pre-Deployment Checks

```bash
pnpm typecheck    # TypeScript errors?
pnpm lint         # Code style issues?
pnpm test         # Tests pass?
pnpm build        # Build succeeds?
```

## Fly.io (Worker)

### Initial Setup

1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
   ```bash
   brew install flyctl  # macOS
   ```

2. Authenticate
   ```bash
   fly auth login
   ```

3. Create app
   ```bash
   cd apps/whatsapp-worker
   fly launch
   ```
   - Choose region (same as database)
   - Skip database (using Supabase)
   - Say yes to Dockerfile generation

4. Set secrets
   ```bash
   fly secrets set DATABASE_URL=postgresql://...
   fly secrets set ANTHROPIC_API_KEY=sk-ant-...
   fly secrets set UPSTASH_URL=https://...
   # ... repeat for all env vars
   ```

### Dockerfile Template

Create `apps/whatsapp-worker/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install Chromium for whatsapp-web.js
RUN apk add --no-cache chromium

# Copy workspace
COPY . .

# Install dependencies
RUN npm install -g pnpm@9
RUN pnpm install --freeze-lockfile

# Build
RUN pnpm --filter @repo/whatsapp-worker build

# Run worker
CMD ["pnpm", "--filter", "@repo/whatsapp-worker", "start"]
```

### Deploy

```bash
fly deploy
```

### Monitor

```bash
fly logs                      # Real-time logs
fly status                    # App status
fly machine list              # Running instances
```

### Environment Variables (Update)

```bash
fly secrets set KEY=value
fly deploy --strategy=immediate  # Redeploy with new secrets
```

## Database Migrations

### Local

```bash
pnpm db:migrate
git add prisma/migrations/
git commit -m "chore: add field_name migration"
```

### Production

Vercel's build hook runs:
```bash
pnpm db:push --skip-generate
```

Or manually:
```bash
# Test migration locally
pnpm db:migrate

# On Vercel, migrations auto-run pre-build
# Verify in Vercel build logs
```

### Rollback

Prisma doesn't support automatic rollback. To undo:

1. Revert git commit
2. Redeploy (migration logic in git, not auto-applied)
3. OR manually roll back DB schema in Supabase

## Monitoring & Observability

### Vercel Analytics

- Dashboard → Analytics
- Tracks Core Web Vitals, edge function latency

### Fly.io Metrics

- Dashboard → Metrics
- CPU, memory, network graphs

### Sentry Error Tracking

1. Set **SENTRY_DSN_WEB** in Vercel env
2. Set **SENTRY_DSN_WORKER** in Fly secrets
3. Errors auto-report
4. Dashboard → Issues → view + filter

### Logging

- **Web:** Vercel logs (stdout/stderr in build output)
- **Worker:** Fly logs (`fly logs`)
- **Database:** Supabase admin panel → Logs

## Post-Deployment Checklist

- [ ] Health check endpoint at `/api/health` returns 200
- [ ] Clerk webhook delivers events (test in Clerk dashboard)
- [ ] Stripe webhook receives events (check Stripe dashboard → Logs)
- [ ] Database migrations applied (check `SELECT * FROM _prisma_migrations`)
- [ ] FirstUser account created, can log in
- [ ] QR code rendering on session setup
- [ ] Messages flow end-to-end (manual test)
- [ ] Sentry receives test error (send one in)
- [ ] Rate limiting working (test with rapid messages)
- [ ] Redis queue processing jobs (check Upstash dashboard)

## Scaling & Costs

- **Vercel:** $20/mo starter; scales auto-scaling
- **Fly.io:** $5/mo app + $0.048/CPU-hr; use 2x shared CPU for worker
- **Supabase:** $25/mo Pro; 10GB storage, 5M queries/mo
- **Upstash:** $0.30/GB; pay-as-you-go
- **Stripe:** 2.9% + $0.30 per charge
- **Claude API:** $3/M input tokens, $15/M output tokens

Estimate monthly math:

- 10,000 messages/mo → ~1M tokens (AI) → ~$3 Claude
- 10,000 API calls → ~$0.50 Supabase
- Hosting ~ $100-150 combined
- **Total est. cost per org trial:** $150-200/mo

---

## See Also

- [Vercel Docs](https://vercel.com/docs)
- [Fly.io Docs](https://fly.io/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Environment Variables Best Practices](https://12factor.net/config)
